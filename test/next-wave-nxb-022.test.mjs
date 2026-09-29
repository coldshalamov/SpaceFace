// Extraction keeps every freed unit: accepted cargo, the same vein or a parked spill, or an
// explicit played-out destruction. A full hold must not delete the bite or charge it twice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COMMODITIES } from '../src/data/commodities.js';
import { createBus } from '../src/core/eventBus.js';
import {
  PICKUP_ACCEPTANCE_RETRY_S,
  pickupAcceptanceRetryBlocks,
} from '../src/core/pickupAcceptance.js';
import { addCargo, cargo as cargoBase, removeCargo } from '../src/systems/cargo.js';
import {
  applyClearedTiles,
  applyVeinRemainders,
  drill,
  generateDrillField,
  tileIndex,
} from '../src/systems/drill.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { fieldMemoryReadout } from '../src/systems/fieldDepletion.js';
import { BEAM_VENT_BONUS_MAX, mining as miningBase } from '../src/systems/mining.js';
import { miningYieldReportedAmount } from '../src/ui/floatingText.js';
import {
  DRILL_CARGO_FULL_BANNER,
  drillCargoFullActivity,
  drillCargoFullAnnouncement,
} from '../src/ui/screens/drill.js';

const SILICATE = COMMODITIES.find((row) => row.id === 'cmdty_silicate');
const IRON = COMMODITIES.find((row) => row.id === 'cmdty_ore_iron');
const VEIN_YIELD = 5;

function volumeFit(capVolume, commodity) {
  const probe = {
    player: {
      cargo: {
        items: {},
        usedVolume: 0,
        usedMass: 0,
        capVolume,
        capMass: 0,
      },
    },
  };
  return addCargo(probe, commodity.id, VEIN_YIELD);
}

function drillHarness() {
  const events = [];
  const cargo = {
    items: {},
    usedVolume: 0,
    usedMass: 0,
    capVolume: SILICATE.volPerU * VEIN_YIELD,
    // Less than one unit of silicate. Volume is the only hard cap.
    capMass: SILICATE.massPerU * 0.2,
  };
  const asteroid = {
    id: 42,
    type: 'asteroid',
    data: { fieldId: 'field_a', yieldU: 16, drillDepletion: 0, lastDrillT: 100 },
  };
  const state = {
    simTime: 100,
    playerId: 1,
    player: { cargo, miningBeam: { tierId: 'beam_mk1', dps: 18 } },
    entities: new Map([
      [1, { id: 1, type: 'ship', hullMax: 100, hull: 100, data: {} }],
      [42, asteroid],
    ]),
    world: { currentSectorId: 'sector_test' },
    fieldDepletion: {
      schemaVersion: 1,
      fields: {
        field_a: {
          fieldId: 'field_a', depletion: 1, richnessMult: 0.45, extractedU: 99,
          destroyedCount: 9, lastChangedT: 0,
        },
      },
      receipts: [],
    },
    rng: () => 0.5,
  };
  const bus = { on() { return () => {}; }, emit(type, payload) { events.push({ type, payload }); } };
  drill.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, cargo, asteroid, events };
}

function standAboveVein(state) {
  const field = state.drill.field;
  for (let col = 0; col < field.length; col++) {
    const column = field[col];
    for (let row = 1; row < column.length; row++) {
      const tile = column[row];
      if (!tile || tile.type !== 'vein') continue;
      const stand = field[col][row - 1];
      stand.type = 'empty';
      stand.hp = 0;
      stand.maxHp = 0;
      stand.ore = null;
      stand.hazard = false;
      stand.structure = null;
      state.drill.avatar.col = col;
      state.drill.avatar.row = row - 1;
      state.drill.avatar.fromCol = col;
      state.drill.avatar.fromRow = row - 1;
      state.drill.avatar.drillTarget = null;
      state.drill.moveCooldown = 0;
      state.drill.remainderHold = 0;
      return { col, row, tile };
    }
  }
  return null;
}

function armVein(tile) {
  tile.type = 'vein';
  tile.ore = SILICATE.id;
  tile.yieldU = VEIN_YIELD;
  tile.hp = 0.01;
  tile.maxHp = 5;
  tile.tierReq = 1;
  tile.hardness = 1;
  tile.hazard = false;
}

function bore(maxFrames, done) {
  for (let i = 0; i < maxFrames; i++) {
    drill.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
    if (done()) return i + 1;
  }
  return maxFrames;
}

function held(cargo, id) {
  return cargo.items[id] || 0;
}

test('a partial vein bite keeps the rejected ore on that cell and charges the rock once', () => {
  const { state, cargo, asteroid } = drillHarness();
  assert.equal(drill.begin(42), true);
  const spot = standAboveVein(state);
  assert.ok(spot, 'the seeded bore needs a vein under an open cell');
  armVein(spot.tile);
  const fit = volumeFit(SILICATE.volPerU * 2, SILICATE);
  assert.ok(fit >= 2 && fit * 2 <= VEIN_YIELD * 2, 'the hold takes a real fraction of the vein');
  assert.ok(fit < VEIN_YIELD, 'the bite has to overflow');
  const blocking = VEIN_YIELD - fit;
  assert.equal(addCargo(state, IRON.id, blocking), blocking);
  assert.equal(volumeFit(cargo.capVolume - cargo.usedVolume, SILICATE), fit);

  const budgetBefore = state.drill.rockBudget;
  const depletionBefore = Number(asteroid.data.drillDepletion) || 0;
  assert.ok(budgetBefore >= VEIN_YIELD, 'the rock can pay this vein');
  const fieldBefore = fieldMemoryReadout(state, 'field_a').extractedU;

  bore(80, () => held(cargo, SILICATE.id) > 0 || spot.tile.yieldU !== VEIN_YIELD);
  const accepted = held(cargo, SILICATE.id);
  const tile = state.drill.field[spot.col][spot.row];
  assert.equal(accepted, fit, 'cargo takes the volume that fits, not the whole vein');
  assert.equal(tile.type, 'vein');
  assert.equal(tile.ore, SILICATE.id);
  assert.equal(tile.yieldU, VEIN_YIELD - accepted);
  assert.equal(accepted + tile.yieldU, VEIN_YIELD);
  assert.equal(state.drill.avatar.col, spot.col);
  assert.equal(state.drill.avatar.row, spot.row - 1, 'the rover stays out of a vein that still holds ore');
  assert.equal(state.drill.rockBudget, budgetBefore - accepted);
  assert.ok(cargo.usedMass > cargo.capMass, 'mass over the label still does not refuse the units');
  assert.equal(
    cargo.usedVolume,
    blocking * IRON.volPerU + accepted * SILICATE.volPerU,
  );

  const yieldU = tile.yieldU;
  const frames = bore(40, () => false);
  assert.equal(frames, 40);
  assert.equal(state.drill.field[spot.col][spot.row].yieldU, yieldU);
  assert.equal(held(cargo, SILICATE.id), accepted, 'the retry hold does not chew the same vein again');

  const pool = state.drill.rockBudgetMax;
  drill.end();
  const depletedOnce = Number(asteroid.data.drillDepletion) || 0;
  assert.ok(
    Math.abs(depletedOnce - depletionBefore - (accepted / pool)) < 1e-6,
    `depletion moved by the accepted units only (got ${depletedOnce})`,
  );
  assert.equal(drill.begin(42), true);
  const again = state.drill.field[spot.col][spot.row];
  assert.equal(again.type, 'vein');
  assert.equal(again.ore, SILICATE.id);
  assert.equal(again.yieldU, VEIN_YIELD - accepted, 're-entry keeps the rejected yield, not the seed total');
  assert.ok(state.drill.rockBudget >= again.yieldU, 'the thinned budget still covers the ore left on the vein');
  assert.notEqual(again.yieldU, VEIN_YIELD);

  assert.equal(removeCargo(state, IRON.id, blocking), blocking);
  const beforeSecond = held(cargo, SILICATE.id);
  bore(900, () => held(cargo, SILICATE.id) >= VEIN_YIELD || state.drill.field[spot.col][spot.row].type === 'empty');
  const second = held(cargo, SILICATE.id) - beforeSecond;
  assert.equal(second, VEIN_YIELD - accepted);
  assert.equal(held(cargo, SILICATE.id), VEIN_YIELD);
  assert.equal(state.drill.field[spot.col][spot.row].type, 'empty');
  drill.end();

  const extracted = fieldMemoryReadout(state, 'field_a').extractedU - fieldBefore;
  assert.ok(Math.abs(extracted - VEIN_YIELD) < 1e-6, `field ledger charged ${extracted}, not the vein twice`);
  assert.ok(asteroid.data.drillDepletion > depletedOnce);
  assert.ok(asteroid.data.drillDepletion < depletedOnce + (VEIN_YIELD / asteroid.data.drillYieldMax));
});

test('a full hold leaves the vein payable, and freeing volume collects it once', () => {
  const { state, cargo, asteroid } = drillHarness();
  cargo.capVolume = SILICATE.volPerU * VEIN_YIELD;
  assert.equal(drill.begin(42), true);
  const spot = standAboveVein(state);
  assert.ok(spot);
  armVein(spot.tile);
  assert.equal(addCargo(state, IRON.id, VEIN_YIELD), VEIN_YIELD);
  const budgetBefore = state.drill.rockBudget;
  const depletionBefore = Number(asteroid.data.drillDepletion) || 0;

  bore(80, () => state.drill.field[spot.col][spot.row].yieldU !== VEIN_YIELD
    || (state.drill.remainderHold || 0) > 0);
  const tile = state.drill.field[spot.col][spot.row];
  assert.equal(held(cargo, SILICATE.id), 0);
  assert.equal(tile.type, 'vein');
  assert.equal(tile.yieldU, VEIN_YIELD);
  assert.equal(state.drill.rockBudget, budgetBefore);
  assert.equal(Number(asteroid.data.drillDepletion) || 0, depletionBefore);
  drill.end();

  assert.equal(removeCargo(state, IRON.id, VEIN_YIELD), VEIN_YIELD);
  assert.equal(drill.begin(42), true);
  assert.equal(state.drill.field[spot.col][spot.row].type, 'vein');
  assert.equal(state.drill.field[spot.col][spot.row].yieldU, VEIN_YIELD);
  bore(900, () => held(cargo, SILICATE.id) >= VEIN_YIELD);
  assert.equal(held(cargo, SILICATE.id), VEIN_YIELD);
  assert.equal(state.drill.field[spot.col][spot.row].type, 'empty');
  const charged = (Number(asteroid.data.drillDepletion) || 0) - depletionBefore;
  drill.end();
  assert.ok(charged > 0);
  assert.ok(charged < (VEIN_YIELD * 2) / asteroid.data.drillYieldMax, 'the refused bite did not charge the rock');
});

function bootMining(capVolume, spawn) {
  const yields = [];
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 6,
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: true } },
  };
  const asteroid = {
    id: 9,
    type: 'asteroid',
    alive: true,
    pos: { x: 8, z: 0 },
    radius: 6,
    data: { typeId: 'ast_metallic', commodityId: IRON.id, fieldId: 'field_a' },
  };
  const state = {
    playerId: player.id,
    player: {
      cargo: { items: {}, capVolume, capMass: 0, usedVolume: 0, usedMass: 0 },
    },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    rng: () => 0,
    simTime: 10,
    tick: 600,
    meta: { seed: 1 },
    world: { currentSectorId: 'sector_test' },
    fieldDepletion: { schemaVersion: 1, fields: {}, receipts: [] },
    mode: 'flight',
  };
  const bus = createBus();
  bus.on('mining:yield', (payload) => yields.push(payload));
  const cargo = { ...cargoBase };
  cargo.init({ state, bus, helpers: { spawnEntity() {} } });
  const spawned = [];
  const mining = { ...miningBase };
  const helpers = {};
  if (spawn !== 'missing') {
    helpers.spawnEntity = (spec) => {
      spawned.push(spec);
      return spec;
    };
  }
  mining.init({
    state,
    bus,
    helpers,
    registry: { get(name) { return name === 'cargo' ? cargo : null; } },
  });
  return { state, mining, asteroid, player, spawned, yields };
}

test('direct-feed mining reports the accepted amount and keeps a failed spill on the rock', () => {
  const requested = 5;
  const fit = volumeFit(IRON.volPerU * 2, IRON);
  assert.ok(fit > 0 && fit < requested);
  const live = bootMining(IRON.volPerU * fit, true);
  live.mining._releaseOre(live.asteroid, { oreTable: { [IRON.id]: 1 } }, requested, live.player);
  const accepted = held(live.state.player.cargo, IRON.id);
  const spilled = live.spawned.reduce((sum, spec) => sum + (spec.data.amount || 0), 0);
  assert.equal(accepted, fit);
  assert.equal(spilled, requested - fit);
  assert.equal(accepted + spilled, requested);
  assert.equal(live.yields.length, 1);
  assert.equal(live.yields[0].qty, requested, 'mission counters still see the released total');
  assert.equal(miningYieldReportedAmount(live.yields[0]), accepted);
  assert.ok(miningYieldReportedAmount(live.yields[0]) < live.yields[0].qty);

  const parked = bootMining(IRON.volPerU * fit, 'missing');
  const fieldBefore = fieldMemoryReadout(parked.state, 'field_a').extractedU;
  parked.mining._releaseOre(parked.asteroid, { oreTable: { [IRON.id]: 1 } }, requested, parked.player);
  const parkedQty = (parked.asteroid.data.parkedOre || []).reduce((sum, lot) => sum + lot.qty, 0);
  assert.equal(held(parked.state.player.cargo, IRON.id) + parkedQty, requested);
  assert.equal(parked.spawned.length, 0);
  parked.mining.helpers.spawnEntity = (spec) => {
    parked.spawned.push(spec);
    return spec;
  };
  parked.mining._flushParkedOre();
  assert.equal(parked.spawned.length, 0, 'a full-hold spill waits out the existing retry cadence');
  parked.state.simTime += PICKUP_ACCEPTANCE_RETRY_S;
  parked.mining._flushParkedOre();
  const flushed = parked.spawned.reduce((sum, spec) => sum + (spec.data.amount || 0), 0);
  assert.equal(flushed, parkedQty);
  assert.equal(held(parked.state.player.cargo, IRON.id), fit);
  assert.equal((parked.asteroid.data.parkedOre || []).length, 0);
  assert.equal(fieldMemoryReadout(parked.state, 'field_a').extractedU, fieldBefore);
});

test('standing on a refused pickup retries on the existing cadence and then collects', () => {
  const h = bootMining(0, true);
  const pickup = {
    id: 4,
    alive: true,
    type: 'pickup',
    pos: { x: 1, z: 1 },
    data: { kind: 'ore', commodityId: IRON.id, amount: 4 },
  };
  h.state.entities.set(pickup.id, pickup);
  const first = h.mining._collectPickupViaEvent(pickup, h.player);
  assert.equal(first.accepted, 0);
  assert.equal(pickup.alive, true);
  assert.equal(pickup.data.amount, 4);
  assert.equal(pickupAcceptanceRetryBlocks(pickup.data, h.player.id, h.state.playerId, h.state.simTime), true);

  h.state.simTime += PICKUP_ACCEPTANCE_RETRY_S / 2;
  const blocked = h.mining._collectPickupViaEvent(pickup, h.player);
  assert.equal(blocked.deferred, true);
  assert.equal(pickup.data.amount, 4);
  assert.equal(held(h.state.player.cargo, IRON.id), 0);

  h.state.player.cargo.capVolume = IRON.volPerU * 4;
  h.state.simTime += PICKUP_ACCEPTANCE_RETRY_S;
  const resumed = h.mining._collectPickupViaEvent(pickup, h.player);
  assert.equal(resumed.accepted, 4);
  assert.equal(held(h.state.player.cargo, IRON.id), 4);
  assert.equal(pickup.alive, false);
  assert.equal(pickupAcceptanceRetryBlocks(pickup.data, h.player.id, h.state.playerId, h.state.simTime), false);
});

test('a vein taller than this visit keeps the unpaid tail when the hold refuses part of it', () => {
  const { state, cargo, asteroid } = drillHarness();
  assert.equal(drill.begin(42), true);
  const spot = standAboveVein(state);
  assert.ok(spot, 'the seeded bore needs a vein under an open cell');
  const tall = VEIN_YIELD + 2;
  armVein(spot.tile);
  spot.tile.yieldU = tall;
  const fit = volumeFit(SILICATE.volPerU * 2, SILICATE);
  assert.ok(fit > 0 && fit < tall);
  const visitBudget = fit + 1;
  assert.ok(visitBudget < tall, 'this visit cannot pay the whole vein');
  assert.ok(visitBudget > fit, 'the hold refuses part of the payable slice');
  state.drill.rockBudget = visitBudget;
  const blocking = VEIN_YIELD - fit;
  assert.equal(addCargo(state, IRON.id, blocking), blocking);
  const depletionBefore = Number(asteroid.data.drillDepletion) || 0;
  const pool = state.drill.rockBudgetMax;
  assert.ok(pool > tall);

  bore(80, () => held(cargo, SILICATE.id) > 0 || (state.drill.remainderHold || 0) > 0);
  const accepted = held(cargo, SILICATE.id);
  const tile = state.drill.field[spot.col][spot.row];
  assert.equal(accepted, fit);
  assert.equal(tile.type, 'vein');
  assert.equal(tile.yieldU, tall - accepted);
  assert.ok(tile.yieldU > visitBudget - accepted, 'ore above this visit stays on the vein');
  assert.equal(state.drill.rockBudget, visitBudget - accepted);
  assert.equal(state.drill.avatar.row, spot.row - 1);
  drill.end();
  const depleted = Number(asteroid.data.drillDepletion) || 0;
  assert.ok(Math.abs(depleted - depletionBefore - (accepted / pool)) < 1e-6);
  assert.equal(drill.begin(42), true);
  const again = state.drill.field[spot.col][spot.row];
  assert.equal(again.type, 'vein');
  assert.equal(again.ore, SILICATE.id);
  assert.equal(again.yieldU, tall - accepted, 're-entry keeps the over-budget tail');
});

test('a full hold does not trim a tall vein down to the visit budget', () => {
  const { state, cargo, asteroid } = drillHarness();
  assert.equal(drill.begin(42), true);
  const spot = standAboveVein(state);
  assert.ok(spot);
  const tall = VEIN_YIELD + 2;
  armVein(spot.tile);
  spot.tile.yieldU = tall;
  const fit = volumeFit(SILICATE.volPerU * 2, SILICATE);
  const visitBudget = fit + 1;
  assert.ok(visitBudget < tall);
  state.drill.rockBudget = visitBudget;
  assert.equal(addCargo(state, IRON.id, VEIN_YIELD), VEIN_YIELD);
  const budgetBefore = state.drill.rockBudget;
  const depletionBefore = Number(asteroid.data.drillDepletion) || 0;

  bore(80, () => (state.drill.remainderHold || 0) > 0);
  const tile = state.drill.field[spot.col][spot.row];
  assert.equal(held(cargo, SILICATE.id), 0);
  assert.equal(tile.type, 'vein');
  assert.equal(tile.yieldU, tall);
  assert.notEqual(tile.yieldU, visitBudget);
  assert.equal(state.drill.rockBudget, budgetBefore);
  assert.equal(Number(asteroid.data.drillDepletion) || 0, depletionBefore);
  drill.end();
  assert.equal(drill.begin(42), true);
  assert.equal(state.drill.field[spot.col][spot.row].type, 'vein');
  assert.equal(state.drill.field[spot.col][spot.row].yieldU, tall);
});

test('taking every unit this visit can pay still clears that vein', () => {
  const { state, cargo } = drillHarness();
  assert.equal(drill.begin(42), true);
  const spot = standAboveVein(state);
  assert.ok(spot);
  const tall = VEIN_YIELD + 2;
  armVein(spot.tile);
  spot.tile.yieldU = tall;
  const payable = volumeFit(cargo.capVolume, SILICATE);
  assert.ok(payable > 0 && payable < tall);
  state.drill.rockBudget = payable;
  bore(80, () => held(cargo, SILICATE.id) >= payable || state.drill.field[spot.col][spot.row].type === 'empty');
  const tile = state.drill.field[spot.col][spot.row];
  assert.equal(held(cargo, SILICATE.id), payable);
  assert.equal(tile.type, 'empty');
  assert.equal(state.drill.rockBudget, 0);
  const tail = tall - payable;
  assert.ok(tail > 0);
  assert.equal(held(cargo, SILICATE.id) + (tile.yieldU || 0), payable);
});

test('a claimed rock keeps the unpaid vein and the pool after the body is gone', () => {
  const sectorId = 'sec_core_alpha';
  const boreSeed = 42;
  const seeded = generateDrillField(boreSeed);
  const startCol = Math.floor(seeded.length / 2);
  let vein = null;
  for (let col = 0; col < seeded.length && !vein; col++) {
    for (let row = 0; row < seeded[col].length; row++) {
      if (col === startCol && row === 0) continue;
      const tile = seeded[col][row];
      if (!tile || tile.type !== 'vein' || !(tile.yieldU > 0)) continue;
      vein = { col, row, idx: tileIndex(col, row), seedYield: Math.floor(tile.yieldU) };
      break;
    }
  }
  assert.ok(vein, 'the bore seed has a vein the entry shaft does not erase');
  const unpaid = vein.seedYield + VEIN_YIELD;
  assert.notEqual(unpaid, vein.seedYield);
  const otherIdx = tileIndex(vein.col === 0 ? 1 : 0, 0);
  assert.notEqual(otherIdx, vein.idx);
  const depletion = 0.2;
  const pool = 80;
  const seenAt = 50;
  const asteroid = {
    id: boreSeed,
    type: 'asteroid',
    alive: true,
    pos: { x: 120, z: -40 },
    radius: 9,
    data: {
      typeId: 'ast_common_rock',
      yieldU: 18,
      fieldId: 'field_a',
      siteId: 'site_claim',
      boreSeed,
      drillCleared: [otherIdx],
      drillVeinRemainders: [{ idx: vein.idx, yieldU: unpaid, ore: SILICATE.id }],
      drillDepletion: depletion,
      drillYieldMax: pool,
      lastDrillT: seenAt,
    },
  };
  const state = {
    simTime: seenAt,
    tick: 0,
    playerId: 1,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 0 } },
    entities: new Map([[asteroid.id, asteroid]]),
    world: { currentSectorId: sectorId },
    meta: { seed: 1 },
    rng: () => 0.5,
  };
  const bus = createBus();
  let nextId = 100;
  const sites = Object.create(asteroidSites);
  sites.init({
    state,
    bus,
    helpers: {
      spawnEntity(spec) {
        const ent = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
        state.entities.set(ent.id, ent);
        return ent;
      },
    },
    registry: { get: () => null },
  });
  const site = makeSiteRecord({
    id: 'site_claim',
    asteroidId: asteroid.id,
    sectorId,
    fieldId: 'field_a',
    createdT: 0,
  });
  site.anchored = true;
  site.boreSeed = boreSeed;
  site.anchor = { x: 120, z: -40, radius: 9, typeId: 'ast_common_rock', yieldU: 18 };
  state.sites.byId[site.id] = site;
  state.sites.order.push(site.id);

  bus.emit('drill:end', { asteroidId: asteroid.id });
  assert.equal(site.drillVeinRemainders.length, 1);
  assert.equal(site.drillVeinRemainders[0].idx, vein.idx);
  assert.equal(site.drillVeinRemainders[0].yieldU, unpaid);
  assert.equal(site.drillVeinRemainders[0].ore, SILICATE.id);
  assert.equal(site.drillDepletion, depletion);
  assert.equal(site.drillYieldMax, pool);
  assert.equal(site.lastDrillT, seenAt);
  assert.ok(!site.cleared.includes(vein.idx), 'a preserved vein is not a hollow cell');
  assert.ok(site.cleared.includes(otherIdx));

  const saved = sites.serialize();
  sites.deserialize(saved);
  const restored = sites.getSite('site_claim');
  assert.equal(restored.drillVeinRemainders[0].yieldU, unpaid);
  assert.equal(restored.drillDepletion, depletion);
  assert.equal(restored.drillYieldMax, pool);

  state.entities.delete(asteroid.id);
  sites._repairAnchors();
  const rock = [...state.entities.values()].find((ent) => ent.type === 'asteroid' && ent.data && ent.data.siteId === 'site_claim');
  assert.ok(rock, 'the claim respawned its rock');
  assert.notEqual(rock.id, asteroid.id);
  assert.equal(rock.data.drillVeinRemainders[0].yieldU, unpaid);
  assert.equal(rock.data.drillVeinRemainders[0].ore, SILICATE.id);
  assert.equal(rock.data.drillDepletion, depletion);
  assert.equal(rock.data.drillYieldMax, pool);
  assert.equal(rock.data.lastDrillT, seenAt);
  assert.ok(!rock.data.drillCleared.includes(vein.idx));

  const drillSys = Object.create(drill);
  drillSys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  assert.equal(drillSys.begin(rock.id), true);
  const resumed = state.drill.field[vein.col][vein.row];
  assert.equal(resumed.type, 'vein');
  assert.equal(resumed.yieldU, unpaid);
  assert.equal(resumed.ore, SILICATE.id);
  assert.notEqual(resumed.yieldU, vein.seedYield);

  const replay = generateDrillField(boreSeed);
  applyClearedTiles(replay, rock.data.drillCleared);
  applyVeinRemainders(replay, rock.data.drillVeinRemainders);
  assert.equal(replay[vein.col][vein.row].yieldU, unpaid);
});

test('the drill screen says a full hold left the ore in the vein', () => {
  const name = 'Silicate';
  assert.match(DRILL_CARGO_FULL_BANNER, /still in that vein/);
  assert.doesNotMatch(DRILL_CARGO_FULL_BANNER, /wast/i);
  assert.match(drillCargoFullActivity(name), /still in the vein/);
  assert.match(drillCargoFullAnnouncement(name), /still in that vein/);
  assert.doesNotMatch(drillCargoFullActivity(name), /wast/i);
  assert.doesNotMatch(drillCargoFullAnnouncement(name), /wast/i);
  const src = readFileSync(new URL('../src/ui/screens/drill.js', import.meta.url), 'utf8');
  assert.equal(src.includes('wastes ore'), false);
  assert.equal(src.includes('ore wasted'), false);
  assert.equal(src.includes('DRILL_CARGO_FULL_BANNER'), true);
  assert.equal(src.includes('drillCargoFullActivity('), true);
  assert.equal(src.includes('drillCargoFullAnnouncement('), true);
});

test('a partial vent bonus reports a full hold once', () => {
  const fit = volumeFit(IRON.volPerU * 2, IRON);
  assert.ok(fit > 0);
  const pulseOre = (fit + VEIN_YIELD) / BEAM_VENT_BONUS_MAX;
  function armVent(live) {
    const full = [];
    live.mining.bus.on('cargo:full', (payload) => full.push(payload));
    const beam = live.mining._beamRuntime(live.player);
    assert.ok(beam.heatMax > 0);
    beam.heat = beam.heatMax;
    live.mining._pulseOre = pulseOre;
    live.mining._pulseTargetId = live.asteroid.id;
    live.mining._pulseCommodityId = IRON.id;
    return full;
  }

  const live = bootMining(IRON.volPerU * fit, true);
  const full = armVent(live);
  const paid = live.mining._resolveVent();
  assert.ok(paid && paid.qty > fit);
  const accepted = held(live.state.player.cargo, IRON.id);
  assert.equal(accepted, fit);
  const spilled = live.spawned.reduce((sum, spec) => sum + (Number(spec.data && spec.data.amount) || 0), 0);
  assert.equal(accepted + spilled, paid.qty);
  assert.equal(full.length, 1, 'the cargo writer is the only full-hold report');
  assert.equal(live.yields.length, 1);
  assert.equal(live.yields[0].qty, paid.qty);
  assert.equal(live.yields[0].acceptedAmount, accepted);
  assert.equal(miningYieldReportedAmount(live.yields[0]), accepted);

  const stub = bootMining(IRON.volPerU * fit, true);
  stub.mining.registry = { get() { return null; } };
  const stubFull = armVent(stub);
  const stubPaid = stub.mining._resolveVent();
  assert.ok(stubPaid && stubPaid.qty > held(stub.state.player.cargo, IRON.id));
  assert.equal(stubFull.length, 1, 'the cargo stub reports a short accept once');
});
