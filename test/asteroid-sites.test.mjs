// Asteroid sites — focused deterministic coverage for the machine-design surface.
// Pure math (siteProduction/siteLogistics) + system behavior (asteroidSites): install law,
// core anchoring, unanchored loss, production flow, courier launch/loss determinism, and the
// save roundtrip. No DOM, no wall clock, seeded state only (test/AGENTS.md).
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import {
  contactProfile, machineCapability, stepContinuousRecipe, stepFabricator,
} from '../src/systems/siteProduction.js';
import {
  connectivityMask, buildComponents, reconcileStores, podLossChance, fleetEstimate, laneCapacity,
} from '../src/systems/siteLogistics.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_MACHINE_BY_ID, SITE_BALANCE, CONTACT_YIELD } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const { COLS, ROWS } = DRILL_CONST;

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });

function makeField(fill = 'dirt') {
  const field = [];
  for (let c = 0; c < COLS; c++) {
    field[c] = [];
    for (let r = 0; r < ROWS; r++) {
      field[c][r] = fill === 'empty' ? EMPTY() : { type: fill, hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7 };
    }
  }
  return field;
}

// ------------------------------------------------------------------ pure math

test('contactProfile counts the 8-ring and treats bounds as empty', () => {
  const field = makeField('dirt');
  field[5][5] = EMPTY();
  field[5][4] = EMPTY(); // hollow access above
  field[6][5] = { type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 1.2 };
  field[4][5] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 };
  field[6][6] = { type: 'vein', hp: 5, maxHp: 5, ore: 'cmdty_ore_iron', yieldU: 2, hazard: false, tierReq: 1, hardness: 1 };
  const p = contactProfile(field, 5, 5, COLS, ROWS);
  assert.equal(p.empty, 1);
  assert.equal(p.basalt, 1);
  assert.equal(p.gas, 1);
  assert.equal(p.ores.cmdty_ore_iron, 1);
  assert.equal(p.matrix, 4);
  assert.equal(p.solid, 7);
  // Corner cell: 5 of the ring are out of bounds → empty.
  const corner = contactProfile(field, 0, 0, COLS, ROWS);
  assert.equal(corner.cells.length, 8);
  assert.ok(corner.empty >= 5);
});

test('machineCapability: extractor pays per contact, gas tap splits by mode', () => {
  const field = makeField('dirt');
  field[5][5] = EMPTY();
  field[5][4] = EMPTY();
  const extractor = SITE_MACHINE_BY_ID.get('sm_extractor');
  const p = contactProfile(field, 5, 5, COLS, ROWS);
  const cap = machineCapability(extractor, p, null);
  // 8-ring minus the one hollow access cell = 7 matrix contacts (the brief's theoretical max).
  assert.equal(cap.outputsPerMin.cmdty_silicate, 7 * CONTACT_YIELD.matrixPerMin);
  assert.equal(cap.powerDraw, 6);

  const gasField = makeField('dirt');
  gasField[5][5] = EMPTY();
  gasField[4][5] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 };
  gasField[6][5] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 };
  const tap = SITE_MACHINE_BY_ID.get('sm_gas_tap');
  const gp = contactProfile(gasField, 5, 5, COLS, ROWS);
  const genCap = machineCapability(tap, gp, 'generate');
  assert.equal(genCap.powerGen, 2 * CONTACT_YIELD.gasPowerPerContact);
  assert.equal(genCap.outputsPerMin.cmdty_gas_hydrogen, undefined);
  const feedCap = machineCapability(tap, gp, 'feedstock');
  assert.equal(feedCap.powerGen, 0);
  assert.equal(feedCap.outputsPerMin.cmdty_gas_hydrogen, 2 * CONTACT_YIELD.gasFeedPerMinPerContact);
  const splitCap = machineCapability(tap, gp, 'split');
  assert.equal(splitCap.powerGen, CONTACT_YIELD.gasPowerPerContact);
  assert.equal(splitCap.outputsPerMin.cmdty_gas_hydrogen, CONTACT_YIELD.gasFeedPerMinPerContact);
});

test('stepContinuousRecipe starves, throttles, and carries fractions', () => {
  const store = { cmdty_ore_iron: 4 };
  const carry = {};
  // 1 minute at full power: rated 3 input-u/min but only 4 iron on hand → starved at 4.
  const res = stepContinuousRecipe({
    recipeId: 'sr_smelt_iron', dtMin: 2, powerRatio: 1, store,
    roomFor: () => 100, carry, throughputBudget: 100,
  });
  assert.equal(res.status, 'starved');
  assert.ok(store.cmdty_ore_iron < 1e-9);
  assert.equal(store.cmdty_refined_metals, 2);
  // No power → nothing moves.
  const dead = stepContinuousRecipe({
    recipeId: 'sr_smelt_iron', dtMin: 1, powerRatio: 0, store: { cmdty_ore_iron: 10 },
    roomFor: () => 100, carry: {}, throughputBudget: 100,
  });
  assert.equal(dead.status, 'no-power');
  // Fractional carry accumulates to whole units.
  const s2 = { cmdty_ore_iron: 100 };
  const c2 = {};
  let whole = 0;
  for (let i = 0; i < 60; i++) {
    stepContinuousRecipe({
      recipeId: 'sr_smelt_iron', dtMin: 1 / 60, powerRatio: 1, store: s2,
      roomFor: () => 100, carry: c2, throughputBudget: 100,
    });
  }
  whole = s2.cmdty_refined_metals || 0;
  assert.ok(whole >= 1, `expected ≥1 refined metal after a rated minute, got ${whole}`);
});

test('stepFabricator commits a batch and scraps it on retool', () => {
  const store = { cmdty_refined_metals: 2, cmdty_purified_silica: 2, cmdty_electronics: 2 };
  const machine = { job: null, carry: {} };
  const start = stepFabricator({
    machine, recipeId: 'sr_fab_courier', dtS: 1, powerRatio: 1, store,
    roomFor: () => 100, wantsBuild: true,
  });
  assert.equal(start.started, true);
  assert.equal(store.cmdty_refined_metals, 1); // inputs committed up front
  // Complete after buildS seconds.
  let completed = null;
  for (let i = 0; i < 95 && !completed; i++) {
    const r = stepFabricator({
      machine, recipeId: 'sr_fab_courier', dtS: 1, powerRatio: 1, store,
      roomFor: () => 100, wantsBuild: false,
    });
    if (r.completed) completed = r.completed;
  }
  assert.ok(completed && completed.outputId === 'pod');
  // Retool mid-batch scraps the committed inputs.
  stepFabricator({ machine, recipeId: 'sr_fab_courier', dtS: 1, powerRatio: 1, store, roomFor: () => 100, wantsBuild: true });
  assert.ok(machine.job);
  const before = { ...store };
  stepFabricator({ machine, recipeId: 'sr_cast_regocrete', dtS: 1, powerRatio: 1, store, roomFor: () => 100, wantsBuild: false });
  assert.equal(machine.job, null);
  assert.deepEqual(store, before); // nothing refunded, nothing double-charged
});

test('components: machines conduct; masks encode NESW', () => {
  const cells = new Set([tileIndex(5, 5), tileIndex(7, 5)]);
  const machines = new Map([[tileIndex(6, 5), 'm1']]);
  const comps = buildComponents(cells, machines, COLS);
  assert.equal(comps.length, 1); // the machine bridges the two cable cells
  assert.deepEqual(comps[0].machineIds, ['m1']);
  const has = (c, r) => cells.has(tileIndex(c, r)) || machines.has(tileIndex(c, r));
  assert.equal(connectivityMask(has, 6, 5), 2 | 8); // E + W neighbors
  const cap = laneCapacity(comps[0], () => 0);
  assert.equal(cap, SITE_BALANCE.laneStoreBase + 2 * SITE_BALANCE.laneStorePerCell);
});

test('reconcileStores re-homes stock by cell overlap and spills orphans', () => {
  const prev = [
    { cells: [10, 11, 12], store: { cmdty_silicate: 9 } },
    { cells: [50], store: { cmdty_ore_iron: 4 } },
  ];
  const comps = [
    { key: 'netA', cells: [11, 12, 13] },   // majority of first store's cells
    { key: 'netB', cells: [90] },            // second store's cells all gone → spilled
  ];
  const map = reconcileStores(prev, comps);
  assert.equal(map.netA.cmdty_silicate, 9);
  assert.equal(map.netB.cmdty_ore_iron, undefined);
});

test('pod loss and fleet estimate math', () => {
  assert.ok(podLossChance(0) >= SITE_BALANCE.podLossBase);
  assert.ok(podLossChance(1) <= SITE_BALANCE.podLossCap);
  assert.ok(podLossChance(1) > podLossChance(0.2), 'danger raises loss odds');
  const est = fleetEstimate({ exportRatePerMin: 6, podCapacity: 12, podBuildS: 90, podsReady: 3, podTarget: 2 });
  assert.equal(est.podsPerMinNeeded, 0.5);
  assert.ok(est.podsPerMinBuilt > est.podsPerMinNeeded);
  assert.equal(est.surplusPods, 1);
  assert.equal(est.starving, false);
});

// ------------------------------------------------------------------ system

function makeBus() {
  const handlers = new Map();
  return {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makeHarness({ credits = true } = {}) {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 },
    entities, playerId: 1,
    player: {
      cargo: {
        items: { cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12, cmdty_electronics: 8, cmdty_purified_silica: 6 },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      spawned.push(ent);
      return ent;
    },
  };
  const passiveCalls = [];
  const registry = {
    get(name) {
      if (name === 'automation' && credits) {
        return {
          creditPassive(gross, source) {
            passiveCalls.push({ gross, source });
            return { credited: Math.round(gross * 0.5) }; // pretend the cap halves it
          },
        };
      }
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities, helpers, spawned, passiveCalls };
}

function addAsteroid(h, id = 42) {
  const ent = {
    id, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

/** Open a live drill session with a hand-carved pocket so installs validate. */
function openSession(h, asteroidId, cells) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(asteroidId);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];

test('install law: hollow + rover adjacency + materials; core anchors and freezes the seed', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);

  // Solid cell rejected.
  let res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 2, row: 20 });
  assert.equal(res.reason, 'not-hollow');
  // Distant hollow cell rejected pre-core (manual install is physical).
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 14, row: 0 });
  assert.equal(res.reason, 'rover-not-adjacent');
  // Adjacent hollow works and opens the claim.
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(res.ok, true);
  const site = h.sys.getSite(res.siteId);
  assert.equal(site.anchored, false);
  // Gas tap demands a gas contact.
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_gas_tap', col: 15, row: 2 });
  assert.equal(res.reason, 'needs-gas-contact');
  // Core anchors, freezes boreSeed, stamps the entity, and spawns the exterior relay.
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res.ok, true);
  assert.equal(site.anchored, true);
  assert.equal(site.boreSeed, 42);
  assert.equal(h.entities.get(42).data.siteAnchored, true);
  assert.ok(h.spawned.some((e) => e.data && e.data.siteBeacon === site.id), 'exterior relay spawned');
  // Second core refused.
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 15, row: 1 });
  assert.equal(res.reason, 'unique');
  // Anchored → remote placement no longer needs the rover.
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 0 });
  assert.equal(res.ok, true);
});

test('materials pull from lane stores before the ship hold', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const site = h.sys.getSite(res.siteId);
  // Seed a lane store with regocrete, then install another machine: store drains first.
  h.sys._runtime(site);
  site.laneStores[0].store.cmdty_regocrete = 2;
  const cargoBefore = h.state.player.cargo.items.cmdty_regocrete;
  const res2 = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res2.ok, true);
  const coreCost = SITE_MACHINE_BY_ID.get('sm_massline_core').cost.cmdty_regocrete;
  assert.equal(h.state.player.cargo.items.cmdty_regocrete, cargoBefore - (coreCost - 2));
});

test('unanchored sites die with their rock; anchored sites re-materialize it', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const siteId = res.siteId;
  // Rock dies (mined out / sector reroll) → unanchored site is lost on the next tick.
  h.entities.get(42).alive = false;
  h.state.drill = null;
  h.state.simTime += 1;
  h.sys.update(1, h.state);
  assert.equal(h.sys.getSite(siteId), null);
  assert.ok(h.bus.events.some((e) => e.name === 'site:lost'));

  // Now an anchored site: entity vanishes, repair sweep respawns the same interior.
  const h2 = makeHarness();
  addAsteroid(h2, 77);
  openSession(h2, 77, POCKET);
  h2.sys.installMachine({ asteroidId: 77, defId: 'sm_extractor', col: 13, row: 2 });
  const r2 = h2.sys.installMachine({ asteroidId: 77, defId: 'sm_massline_core', col: 14, row: 1 });
  const site2 = h2.sys.getSite(r2.siteId);
  h2.entities.delete(77);
  h2.state.drill = null;
  h2.sys._repairSweepWanted = true;
  h2.state.simTime += 1;
  h2.sys.update(1, h2.state);
  const rock = [...h2.entities.values()].find((e) => e.type === 'asteroid' && e.data && e.data.siteId === site2.id);
  assert.ok(rock, 'anchored site respawned its rock');
  assert.equal(rock.data.boreSeed, 77);
  assert.equal(site2.asteroidId, rock.id);
  assert.deepEqual(rock.data.drillCleared, site2.cleared);
});

/** Build the §9 milestone chain in a hand-carved pocket and run it. */
function buildMilestoneSite(h) {
  addAsteroid(h);
  const field = openSession(h, 42, POCKET);
  // Force two gas pockets beside 15,2 so the tap validates (hand-authored fixture).
  field[16][2] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 };
  field[16][1] = { type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 };
  const ids = {};
  let r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  ids.extractor = r.machineId;
  const siteId = r.siteId;
  h.state.drill.avatar = { col: 14, row: 1 };
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 0 });
  ids.core = r.machineId;
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_gas_tap', col: 15, row: 2 });
  ids.tap = r.machineId;
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_refinery', col: 13, row: 1 });
  ids.refinery = r.machineId;
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_fabricator', col: 13, row: 3 });
  ids.fab = r.machineId;
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 3 });
  ids.port = r.machineId;
  // One shared spine: machines conduct, so the two corridors bolt everything together.
  const site = h.sys.getSite(siteId);
  for (const [c, row] of [[14, 1], [14, 2], [15, 1]]) {
    h.sys.setOverlay(siteId, 'power', c, row, true);
    h.sys.setOverlay(siteId, 'lane', c, row, true);
  }
  return { siteId, site, ids };
}

test('§9 milestone: extract → refine → fabricate → launch → deliver through the passive cap', () => {
  const h = makeHarness();
  const { siteId, site } = buildMilestoneSite(h);
  h.state.drill = null; // player retracts; production runs on sim time

  // Seed the fab chain with imported parts (the first-trip haul).
  h.sys._runtime(site);
  const store = site.laneStores[0].store;
  store.cmdty_refined_metals = 6;
  store.cmdty_purified_silica = 6;
  store.cmdty_electronics = 6;

  // Everything exportable ships; keep intermediates held (default policy).
  h.sys.setExportFlag(siteId, 'cmdty_silicate', true);
  h.sys.setPodTarget(siteId, 3);

  for (let i = 0; i < 900; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }

  const proj = h.sys.projection(siteId);
  assert.ok(proj.exportRatePerMin > 0, 'extractor exports silicate');
  assert.ok(site.fleet.launches >= 1, `expected ≥1 courier launch in 15 min, got ${site.fleet.launches}`);
  assert.ok(site.fleet.podsReady + site.fleet.inFlight.length + site.fleet.delivered + site.fleet.lost >= 1, 'fabricator built pods');
  const delivered = h.bus.events.filter((e) => e.name === 'site:courierDelivered');
  const lost = h.bus.events.filter((e) => e.name === 'site:courierLost');
  assert.equal(site.fleet.delivered, delivered.length);
  assert.equal(site.fleet.lost, lost.length);
  if (delivered.length) {
    assert.ok(h.passiveCalls.length >= delivered.length, 'every delivery routed through creditPassive');
    assert.ok(h.passiveCalls.every((c) => c.source === 'site:courier'));
    assert.ok(site.stats.creditedCr <= site.stats.grossCr, 'cap can only shrink gross');
  }
  // Courier visuals spawned for in-sector launches.
  assert.ok(h.spawned.some((e) => e.data && e.data.kind === 'site_courier'));
});

test('determinism: identical harness runs produce identical outcomes', () => {
  const run = () => {
    const h = makeHarness();
    const { siteId, site } = buildMilestoneSite(h);
    h.state.drill = null;
    h.sys._runtime(site);
    Object.assign(site.laneStores[0].store, { cmdty_refined_metals: 6, cmdty_purified_silica: 6, cmdty_electronics: 6 });
    h.sys.setPodTarget(siteId, 3);
    for (let i = 0; i < 1200; i++) {
      h.state.simTime += 1;
      h.sys.update(1, h.state);
    }
    return JSON.stringify({
      launches: site.fleet.launches,
      delivered: site.fleet.delivered,
      lost: site.fleet.lost,
      gross: site.stats.grossCr,
      stores: site.laneStores.map((l) => l.store),
      rng: h.state.sites.meta.rngSeed,
    });
  };
  assert.equal(run(), run());
});

test('serialize keeps anchored sites only and survives a roundtrip', () => {
  const h = makeHarness();
  const { siteId, site } = buildMilestoneSite(h);
  // A second, unanchored claim on another rock.
  addAsteroid(h, 55);
  openSession(h, 55, POCKET);
  const r = h.sys.installMachine({ asteroidId: 55, defId: 'sm_extractor', col: 13, row: 2 });
  assert.notEqual(r.siteId, siteId);
  const blob = h.sys.serialize();
  assert.ok(blob.byId[siteId], 'anchored site serialized');
  assert.equal(blob.byId[r.siteId], undefined, 'unanchored site not serialized');
  h.sys.deserialize(JSON.parse(JSON.stringify(blob)));
  const restored = h.sys.getSite(siteId);
  assert.equal(restored.machines.length, site.machines.length);
  assert.equal(restored.anchored, true);
  assert.deepEqual(restored.overlays, site.overlays);
});
