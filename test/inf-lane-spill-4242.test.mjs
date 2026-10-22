// Seed 4242 — clearing a loaded lane names the goods before the player confirms the loss.
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex } from '../src/systems/drill.js';
import { storeTotal } from '../src/systems/siteLogistics.js';
import { asteroidSites, spillGoodsPhrase } from '../src/systems/asteroidSites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const CORRIDOR = [[4, 20], [5, 20], [6, 20], [7, 20], [8, 20]];
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
const idx = (col, row) => tileIndex(col, row);

function harness() {
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(name, payload) { events.push({ name, payload }); },
  };
  const entities = new Map();
  const state = {
    simTime: 0,
    tick: 0,
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
    world: { currentSectorId: 'sector_vesta_forge' },
    content: { commodities: COMMODITIES },
    rng: { next() { return 0.42; }, int(n) { return 0; }, chance() { return false; } },
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
    id: 42, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  });
  const cells = [...POCKET, ...CORRIDOR];
  const field = generateDrillField(42);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  entities.get(42).data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  state.drill = { active: true, asteroidId: 42, field, avatar: { col: 14, row: 2 } };
  const installed = sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(installed.ok, true);
  const core = sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(core.ok, true);
  const site = sys.getSite(installed.siteId);
  return { sys, state, site, siteId: installed.siteId, events };
}

test('clearing a loaded Vesta lane names the goods and waits for a second confirm', () => {
  const { sys, site, siteId, events } = harness();
  for (const [c, r] of CORRIDOR) {
    assert.equal(sys.setOverlay(siteId, 'lane', c, r, true).ok, true);
  }
  sys._runtime(site);
  const lane = site.laneStores.find((row) => row.cells.includes(idx(4, 20)));
  lane.store.cmdty_ore_einsteinium = 4;
  lane.store.cmdty_ore_iron = 6;
  const before = site.laneStores.reduce((sum, row) => sum + storeTotal(row.store), 0);

  for (const [c, r] of CORRIDOR.slice(0, -1)) {
    const step = sys.setOverlay(siteId, 'lane', c, r, false);
    assert.equal(step.ok, true, `cell ${c},${r} still has a home for the stock`);
  }
  const [lastC, lastR] = CORRIDOR[CORRIDOR.length - 1];
  const refused = sys.setOverlay(siteId, 'lane', lastC, lastR, false);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'would-spill');
  assert.equal(refused.spill.spilledTotal, 10);
  assert.equal(
    refused.warning,
    'Clearing this lane would spill 4u Stellarite Ore and 6u Iron Ore — clear it again to confirm the loss.',
  );
  assert.equal(refused.warning.includes('cmdty_'), false);
  assert.equal(site.overlays.lane.includes(idx(lastC, lastR)), true);
  const held = site.laneStores.reduce((sum, row) => sum + storeTotal(row.store), 0);
  assert.equal(held, before, 'the refusal leaves the ore on the lane');

  const confirmed = sys.setOverlay(siteId, 'lane', lastC, lastR, false, { confirmSpill: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.spilled, 10);
  const receipt = events.find((e) => e.name === 'site:laneSpilled');
  assert.ok(receipt);
  assert.deepEqual(receipt.payload.goods, { cmdty_ore_einsteinium: 4, cmdty_ore_iron: 6 });
  const line = site.ledger.find((entry) => entry.kind === 'warn' && entry.text.includes('spilled'));
  assert.equal(
    line.text,
    'Lane dismantled under load — spilled 4u Stellarite Ore and 6u Iron Ore.',
  );
  assert.equal(line.text.includes('cmdty_'), false);
  sys._runtime(site);
  const left = site.laneStores.reduce((sum, row) => sum + storeTotal(row.store), 0);
  assert.equal(left, before - 10);
});

test('an unnamed good still reads as words, not a catalog id', () => {
  assert.equal(
    spillGoodsPhrase({
      spilledTotal: 3,
      spilled: [{ store: { cmdty_made_up_rock: 3 } }],
    }),
    '3u made up rock',
  );
});
