// AL-LG-13 — one alloy recipe book across every producer: a player-built outpost refinery runs
// the same CLAIM_REFINERY_RECIPES book the claim refinery, site sm_refinery, and legacy hold
// refinery run. 100 iron gives the same output through every producer; alloys need titanium
// everywhere. Pre-book saves keep every stored good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { claims as claimsBase } from '../src/systems/claims.js';
import { automation } from '../src/systems/automation.js';
import { OUTPOSTS } from '../src/data/automation.js';
import { CLAIM_REFINERY_RECIPES, MATERIAL_RECIPE_BY_GOOD } from '../src/data/sites.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { SECTORS } from '../src/data/sectors.js';
import { addCargo } from '../src/systems/cargo.js';
import { stepContinuousRecipe } from '../src/systems/siteProduction.js';

const LAWFUL = 'sector_helios_prime';
const IRON = 'cmdty_ore_iron';
const TITANIUM = 'cmdty_ore_titanium';
const ALLOY = 'cmdty_alloys';
const REFINED = 'cmdty_refined_metals';
const OUTPOST_DEF = OUTPOSTS.find((o) => o.id === 'outpost_refinery');

// ── harness (same shape as al-long-4-one-works) ─────────────────────────────────────────────
function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeEconomyStub(priceTable = {}) {
  return {
    name: 'economy',
    prices: priceTable,
    markets: {},
    priceOf(stationId, goodId) {
      return this.prices[goodId] != null ? this.prices[goodId] : 50;
    },
  };
}

function boot({ seed = 4242, economy = makeEconomyStub({ [REFINED]: 80 }) } = {}) {
  const state = {
    simTime: 1000,
    meta: { seed },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits: 200000,
      heat: 0,
      droneTierCap: 1,
      stats: {},
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 4000, capMass: 4000 },
      ownedShips: [],
    },
    factions: Object.freeze({}),
    world: { currentSectorId: LAWFUL, activeSector: null },
    entities: new Map(),
    entityList: [],
    claims: null,
    automation: { drones: [], traders: [], outposts: [], guards: [], upgrades: [] },
  };
  const bus = makeBus();
  const peers = new Map();
  const registry = { get: (name) => peers.get(name) || null };
  bus.on('economy:chargeCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = Math.max(0, (state.player.credits || 0) - amt);
  });
  bus.on('economy:grantCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = (state.player.credits || 0) + amt;
  });
  if (economy) {
    peers.set('economy', economy);
    if (economy.markets) state.economy = { markets: economy.markets };
  }
  const sys = { ...claimsBase };
  sys.init({ state, bus, helpers: {}, registry });
  sys.newGame();
  automation.init({ state, bus, helpers: {}, registry });
  return { state, bus, sys };
}

function runSim(h, seconds, dt = 1) {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
  }
}

function commission(h, specId, poiId, pos = { x: 40, z: 10 }) {
  assert.equal(h.sys.claim({ id: poiId, name: poiId + ' yard', size: 'M', pos }), true);
  const body = h.state.claims.bodies.at(-1);
  const def = BODY_SPECIALIZATION_BY_ID.get(specId);
  assert.equal(h.sys.buildModule(body.id, def.requiresModule), true);
  assert.equal(h.sys.specialize(body.id, specId), true);
  return body;
}

function holdRefinery(h, inputs = {}) {
  assert.equal(h.sys.claim({ id: 'poi_hold', name: 'Hold', size: 'M', pos: { x: 0, z: 0 } }), true);
  const body = h.state.claims.bodies.at(-1);
  assert.equal(h.sys.buildModule(body.id, 'mod_refinery'), true);
  for (const [goodId, qty] of Object.entries(inputs)) addCargo(h.state, goodId, qty);
  runSim(h, 400, 1);
  return h.state.player.cargo.items;
}

// Feed the outpost by drone buffers (the real intake) and run one coarse production step far
// below the autosell cadence so storage is still banked for assertions.
function runOutpost(h, buffers, storageOverride = {}) {
  const a = h.state.automation;
  const o = {
    id: 'outpost_1', defId: 'outpost_refinery', sectorId: LAWFUL,
    level: 1, storage: 0, autoSell: true, status: 'producing', ...storageOverride,
  };
  a.outposts.push(o);
  let n = 0;
  for (const [goodId, qty] of Object.entries(buffers)) {
    a.drones.push({
      id: 'feeder_' + (++n), defId: 'drone_mk1', sectorId: LAWFUL,
      status: 'mining', oreType: goodId, buffer: qty,
    });
  }
  automation._produceOutpost(o, OUTPOST_DEF, 240, a);
  return o;
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────

test('100 iron gives the same output through every producer — 50 refined metals, zero alloys', () => {
  const h = boot();
  const claimBody = commission(h, 'spec_refinery', 'poi_parity');
  addCargo(h.state, IRON, 100);
  assert.equal(h.sys.deliverToClaim(claimBody.id, IRON, 100), 100);
  runSim(h, 400, 1);
  assert.equal(claimBody.spec.store.output[REFINED], 50, 'claim refinery');
  assert.equal(claimBody.spec.store.output[ALLOY] || 0, 0, 'no alloys without titanium');

  const siteStore = { [IRON]: 100 };
  stepContinuousRecipe({
    recipeId: 'sr_smelt_iron', dtMin: 1000, powerRatio: 1, store: siteStore,
    roomFor: () => Infinity, carry: {}, throughputBudget: null,
  });
  assert.equal(siteStore[REFINED], 50, 'site refinery');

  const holdItems = holdRefinery(h, { [IRON]: 100 });
  assert.equal(holdItems[REFINED], 50, 'hold refinery');
  assert.equal(holdItems[ALLOY] || 0, 0, 'hold refinery makes no alloys from iron alone');

  const o = runOutpost(h, { [IRON]: 100 });
  assert.equal(o.storage, 50, 'outpost refinery');
  assert.equal(o.storageGoodId, REFINED, 'outpost banks refined metals, not alloys');
  assert.deepEqual(o.production.consumedByGood, { [IRON]: 100 });
});

test('100 iron + 50 titanium yields the same alloy batch ratio through every producer', () => {
  const h = boot();
  const claimBody = commission(h, 'spec_refinery', 'poi_alloy');
  addCargo(h.state, IRON, 100);
  addCargo(h.state, TITANIUM, 50);
  h.sys.deliverToClaim(claimBody.id, IRON, 100);
  h.sys.deliverToClaim(claimBody.id, TITANIUM, 50);
  runSim(h, 400, 1);
  assert.equal(claimBody.spec.store.output[ALLOY], 50, 'claim refinery: 50 alloy batches');

  const siteStore = { [IRON]: 100, [TITANIUM]: 50 };
  stepContinuousRecipe({
    recipeId: 'sr_blend_alloys', dtMin: 1000, powerRatio: 1, store: siteStore,
    roomFor: () => Infinity, carry: {}, throughputBudget: null,
  });
  assert.equal(siteStore[ALLOY], 50, 'site refinery: 50 alloy batches');

  const holdItems = holdRefinery(h, { [IRON]: 100, [TITANIUM]: 50 });
  assert.equal(holdItems[ALLOY], 50, 'hold refinery: 50 alloy batches');

  const o = runOutpost(h, { [IRON]: 100, [TITANIUM]: 50 });
  assert.equal(o.storage, 50, 'outpost: same alloy count subject to outRate');
  assert.equal(o.storageGoodId, ALLOY);
  // Per-batch ratio parity: 2 iron + 1 titanium per alloy, identical to the book.
  assert.equal(o.production.consumedByGood[IRON], 100);
  assert.equal(o.production.consumedByGood[TITANIUM], 50);
  assert.equal(o.production.consumedByGood[IRON] / o.production.consumedByGood[TITANIUM], 2);
});

test('a pre-book save keeps every stored good and resumes on the book', () => {
  const h = boot();
  // Old-shape outpost: banked goods, no storageGoodId stamp (the old recipe only ever
  // banked alloys), no private recipe field.
  const o = runOutpost(h, { [IRON]: 100, [TITANIUM]: 50 }, { storage: 40 });
  assert.ok(o.storage >= 40, 'the legacy bank is never drained by the migration');
  assert.equal(o.storageGoodId, ALLOY, 'legacy alloys stay alloys under the book');
  const storedAlloys = o.storage;
  assert.equal(storedAlloys, 40 + 50, 'banked alloys preserved plus new book output');
});

test('the outpost def carries no private inputs table — it reads the shared book', () => {
  assert.equal(OUTPOST_DEF.recipe.book, 'claim_refinery');
  assert.equal(OUTPOST_DEF.recipe.inputs, undefined, 'no second recipe table');
  assert.ok(
    CLAIM_REFINERY_RECIPES.some((r) => Object.keys(r.output)[0] === ALLOY),
    'the book still produces alloys',
  );
  const canonicalRows = new Set(Object.values(MATERIAL_RECIPE_BY_GOOD));
  for (const def of OUTPOSTS) {
    const inputs = def.recipe && def.recipe.inputs;
    if (!inputs) continue;
    // Row 402: a def that holds the canonical material row IS reading the shared book by
    // reference; only a private table re-listing book inputs is the regression to catch.
    if (canonicalRows.has(def.recipe)) continue;
    assert.ok(
      !CLAIM_REFINERY_RECIPES.some((r) => JSON.stringify(r.inputs) === JSON.stringify(inputs)),
      `${def.id} re-tables a book recipe`,
    );
  }
});
