// AL-LONG-4 / build-map row 402 ("One works", first slice): a claim Industrial Refinery runs the
// SAME recipe book a site sm_refinery runs, hands its output to a same-sector Trade Relay on its
// own, and the relay's scheduled convoy sells it at a station — the player's hold never carries the
// goods. Old saves keep every stored good and get one receipt saying what changed. Drives the
// shipped claims system headlessly (no browser, no GPU).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { claims as claimsBase } from '../src/systems/claims.js';
import { CLAIM_REFINERY_RECIPES, SITE_RECIPES, SITE_RECIPE_BY_ID } from '../src/data/sites.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { SECTORS } from '../src/data/sectors.js';
import { addCargo } from '../src/systems/cargo.js';
import { stepContinuousRecipe } from '../src/systems/siteProduction.js';

const LAWFUL = 'sector_helios_prime';
const IRON = 'cmdty_ore_iron';
const COPPER = 'cmdty_ore_copper';
const REFINED = 'cmdty_refined_metals';
const STARVED_LINE = 'Awaiting ore — next batch consumes 2u of one refinable ore';

// ── harness (same shape as next-wave-nxb-033) ────────────────────────────────────────────────

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

// The settle path only sells into a market that lists the good (state.economy.markets), so the
// stub's price table is mirrored as listed sell quotes on every station it quotes.
function makeEconomyStub(priceTable = {}) {
  const markets = {};
  for (const sector of SECTORS) {
    for (const st of sector.stations || []) {
      const row = {};
      for (const [key, price] of Object.entries(priceTable)) {
        const parts = key.split('|');
        if (parts.length === 3) {
          if (parts[0] === st.id && parts[2] === 'sell') row[parts[1]] = { lastSell: price };
        } else row[key] = { lastSell: price };
      }
      markets[st.id] = row;
    }
  }
  return {
    name: 'economy',
    prices: priceTable,
    markets,
    priceOf(stationId, goodId, side) {
      const key = stationId + '|' + goodId + '|' + side;
      if (key in this.prices) return this.prices[key];
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
  // Reset the module-level claim counter so each boot starts at claim_1 (deterministic ids).
  sys.newGame();
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
  assert.equal(h.sys.claim({ id: poiId, name: poiId + ' yard', size: 'M', pos }), true,
    'claiming ' + poiId + ' succeeds');
  const body = h.state.claims.bodies.at(-1);
  const def = BODY_SPECIALIZATION_BY_ID.get(specId);
  assert.equal(h.sys.buildModule(body.id, def.requiresModule), true, 'module builds: ' + def.requiresModule);
  assert.equal(h.sys.specialize(body.id, specId), true, 'commissioning succeeds: ' + specId);
  return body;
}

function receiptEvents(h, kind, bodyId) {
  return h.bus.emitLog.filter((e) => e.evt === 'claim:receipt'
    && e.payload.receipt.kind === kind && (!bodyId || e.payload.bodyId === bodyId));
}

function chainHost() {
  const h = boot();
  const refinery = commission(h, 'spec_refinery', 'poi_chain_refinery', { x: 20, z: 0 });
  const relay = commission(h, 'spec_relay', 'poi_chain_relay', { x: 40, z: 10 });
  return { h, refinery, relay };
}

// ── 1. one recipe book ──────────────────────────────────────────────────────────────────────

test('claim refineries share the site sm_refinery recipe book, plus a copper smelt', () => {
  for (const r of CLAIM_REFINERY_RECIPES) {
    if (!r.id.startsWith('sr_')) continue;
    const site = SITE_RECIPE_BY_ID.get(r.id);
    assert.ok(site, 'site recipe exists: ' + r.id);
    assert.deepEqual(r.inputs, site.inputs, 'inputs match the site recipe: ' + r.id);
    assert.deepEqual(r.output, site.output, 'output matches the site recipe: ' + r.id);
  }
  const siteRefineryIds = SITE_RECIPES.filter((r) => r.machine === 'sm_refinery').map((r) => r.id).sort();
  const claimRefineryIds = CLAIM_REFINERY_RECIPES.filter((r) => r.id.startsWith('sr_')).map((r) => r.id).sort();
  assert.deepEqual(claimRefineryIds, siteRefineryIds, 'every live sm_refinery mode is in the claim book');
  assert.ok(
    !CLAIM_REFINERY_RECIPES.some((r) => Object.keys(r.output).includes('cmdty_comp_circuitry')),
    'no claim refinery recipe makes circuitry',
  );
  assert.ok(
    !CLAIM_REFINERY_RECIPES.some((r) => Object.keys(r.output).includes('cmdty_polymers')),
    'no claim refinery recipe makes polymers',
  );
  assert.ok(!SITE_RECIPES.some((r) => r.id === 'claim_smelt_copper'),
    'the copper smelt stays out of the site catalog (planner/census unchanged)');
});

// ── 2. parity: 100 iron through either producer ──────────────────────────────────────────────

test('100 iron gives 50 refined metals through the claim refinery and the site refinery alike', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery', 'poi_parity');
  addCargo(h.state, IRON, 100);
  assert.equal(h.sys.deliverToClaim(body.id, IRON, 100), 100);
  runSim(h, 400, 1);
  assert.equal(body.spec.store.output[REFINED], 50, 'claim refinery: 100 iron -> 50 refined');
  assert.equal(body.spec.store.input[IRON] || 0, 0, 'no iron is left behind');

  const store = { [IRON]: 100 };
  stepContinuousRecipe({
    recipeId: 'sr_smelt_iron', dtMin: 1000, powerRatio: 1, store,
    roomFor: () => Infinity, carry: {}, throughputBudget: null,
  });
  assert.equal(store[REFINED], 50, 'site refinery: 100 iron -> 50 refined');
  assert.equal(store[REFINED], body.spec.store.output[REFINED], 'both producers agree');
});

// ── 3. alloys need both partners ────────────────────────────────────────────────────────────

test('alloys need iron and titanium — titanium alone is a starved site', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery', 'poi_alloy');
  addCargo(h.state, 'cmdty_ore_titanium', 2);
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_ore_titanium', 2), 2);
  runSim(h, 60, 1);
  assert.equal(body.spec.store.output.cmdty_alloys || 0, 0, 'titanium alone makes no alloys');
  assert.equal(h.sys.ledger(body.id).status, STARVED_LINE, 'the readout names the missing whole batch');

  addCargo(h.state, IRON, 2);
  assert.equal(h.sys.deliverToClaim(body.id, IRON, 2), 2);
  runSim(h, 60, 1);
  assert.equal(body.spec.store.output.cmdty_alloys, 1, '2 iron + 1 titanium make one alloy');
  assert.equal(body.spec.store.input[IRON] || 0, 0, 'the iron bill is fully consumed');
  assert.equal(body.spec.store.input.cmdty_ore_titanium || 0, 1,
    'the one unpaired titanium waits for more iron — the blend bill was paid');
});

// ── 4. copper is metal feedstock, never circuitry (AL-LG-14) ─────────────────────────────────

test('copper smelts to refined metals only — at a claim and in the old hold refinery', () => {
  const h = boot();
  const body = commission(h, 'spec_refinery', 'poi_copper');
  addCargo(h.state, COPPER, 10);
  assert.equal(h.sys.deliverToClaim(body.id, COPPER, 10), 10);
  runSim(h, 60, 1);
  assert.equal(body.spec.store.output[REFINED], 5, '10 copper -> 5 refined metals');
  assert.equal(body.spec.store.output.cmdty_comp_circuitry, undefined, 'copper never becomes circuitry');
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_ore_platinoid', 4), 0,
    'an ore the book does not accept is refused');

  // Legacy unspecialized hold refinery: same book, same result.
  const h2 = boot();
  assert.equal(h2.sys.claim({ id: 'poi_legacy_hold', name: 'Legacy Hold', size: 'M', pos: { x: 0, z: 0 } }), true);
  const legacy = h2.state.claims.bodies.at(-1);
  assert.equal(h2.sys.buildModule(legacy.id, 'mod_refinery'), true);
  assert.equal(legacy.spec, null, 'the body stays unspecialized');
  addCargo(h2.state, COPPER, 10);
  runSim(h2, 60, 1);
  assert.equal(h2.state.player.cargo.items[REFINED], 5, 'the hold refinery makes refined metals');
  assert.equal(h2.state.player.cargo.items.cmdty_comp_circuitry, undefined, 'and never circuitry');
});

// ── 5. the chain: refinery -> relay -> station, no player hold ───────────────────────────────

test('a refinery forwards to a same-sector relay, whose convoy sells — the hold never carries it', () => {
  const { h, refinery, relay } = chainHost();
  assert.equal(refinery.id, 'claim_1');
  assert.equal(relay.id, 'claim_2');
  assert.equal(refinery.sectorId, relay.sectorId);

  addCargo(h.state, IRON, 100);
  assert.equal(h.sys.deliverToClaim(refinery.id, IRON, 100), 100);

  for (let i = 0; i < 600; i++) {
    h.state.simTime += 1;
    h.sys.update(1, h.state);
    assert.equal(h.state.player.cargo.items[REFINED] || 0, 0,
      'the hold never gains the forwarded goods (tick ' + i + ')');
  }

  const forwarded = receiptEvents(h, 'relay_forwarded', refinery.id);
  const received = receiptEvents(h, 'relay_received', relay.id);
  const dispatched = receiptEvents(h, 'convoy_dispatched', relay.id);
  const sold = receiptEvents(h, 'convoy_sold', relay.id);
  assert.ok(forwarded.length >= 1, 'the refinery wrote a forward receipt');
  assert.ok(forwarded.every((e) => e.payload.receipt.data.toBodyId === relay.id),
    'every forward names the same-sector relay');
  assert.ok(forwarded.every((e) => e.payload.receipt.data.qty >= 20),
    'forwards batch at least the relay minimum load');
  for (const e of forwarded) {
    assert.deepEqual(Object.keys(e.payload.receipt.data.goods), [REFINED],
      'only the refinery output is forwarded');
  }
  assert.ok(received.length >= 1, 'the relay wrote a received receipt');
  assert.equal(received[0].payload.receipt.data.fromBodyId, refinery.id);
  assert.equal(received[0].payload.receipt.data.qty, forwarded[0].payload.receipt.data.qty);

  assert.ok(dispatched.length >= 1, 'the relay convoy left');
  assert.ok(sold.length >= 1, 'the convoy sold at the station');
  const all = h.bus.emitLog.filter((e) => e.evt === 'claim:receipt');
  assert.ok(all.indexOf(received[0]) < all.indexOf(dispatched[0]), 'received before dispatch');
  assert.ok(all.indexOf(dispatched[0]) < all.indexOf(sold[0]), 'dispatch before sale');

  const sales = h.bus.emitLog.filter((e) => e.evt === 'economy:grantCredits'
    && e.payload.reason === 'claim_relay_sale');
  assert.ok(sales.some((e) => e.payload.amount > 0), 'the relay paid the player real credits');

  const forwardedTotal = forwarded.reduce((s, e) => s + e.payload.receipt.data.qty, 0);
  assert.equal(h.sys.ledger(refinery.id).flows.forwardedU, forwardedTotal,
    'the ledger forwarded total equals the receipts');
  assert.equal(h.sys.ledger(relay.id).flows.receivedU, forwardedTotal,
    'the relay ledger counts every received unit');
});

// ── 5b. a full first relay does not shadow an empty second relay ─────────────────────────────

test('a full lowest-id relay is skipped so a later same-sector relay still receives freight', () => {
  const h = boot();
  const refinery = commission(h, 'spec_refinery', 'poi_pick_refinery');
  const fullRelay = commission(h, 'spec_relay', 'poi_pick_relay_full');
  const openRelay = commission(h, 'spec_relay', 'poi_pick_relay_open');
  assert.equal(fullRelay.id, 'claim_2');
  assert.equal(openRelay.id, 'claim_3');
  const relayDef = BODY_SPECIALIZATION_BY_ID.get('spec_relay');

  addCargo(h.state, REFINED, relayDef.storeCapU);
  assert.equal(h.sys.deliverToClaim(fullRelay.id, REFINED, relayDef.storeCapU), relayDef.storeCapU,
    'the first relay is filled to capacity');

  addCargo(h.state, IRON, 100);
  assert.equal(h.sys.deliverToClaim(refinery.id, IRON, 100), 100);
  runSim(h, 120, 1);

  const forwarded = receiptEvents(h, 'relay_forwarded', refinery.id);
  assert.ok(forwarded.length >= 1, 'the refinery still forwards despite the full first relay');
  assert.ok(forwarded.every((e) => e.payload.receipt.data.toBodyId === openRelay.id),
    'every forward goes to the relay with free space, not the full lowest-id one');
  const received = receiptEvents(h, 'relay_received', openRelay.id);
  assert.ok(received.length >= 1, 'the open relay receives the freight');
  assert.equal(received[0].payload.receipt.data.fromBodyId, refinery.id);
  assert.equal(h.sys.ledger(openRelay.id).flows.receivedU, received.reduce(
    (s, e) => s + e.payload.receipt.data.qty, 0), 'the receiving ledger matches the receipt');
});

// ── 6. determinism ──────────────────────────────────────────────────────────────────────────

function runChainFingerprint() {
  const { h, refinery } = chainHost();
  addCargo(h.state, IRON, 100);
  h.sys.deliverToClaim(refinery.id, IRON, 100);
  runSim(h, 600, 1);
  const sequence = h.bus.emitLog
    .filter((e) => e.evt === 'claim:receipt')
    .map((e) => [e.payload.bodyId, e.payload.receipt.kind, JSON.stringify(e.payload.receipt.data || null)]);
  return { sequence, credits: h.state.player.credits };
}

test('the same seed produces the same receipt sequence and the same credits (seed 4242)', () => {
  const a = runChainFingerprint();
  const b = runChainFingerprint();
  assert.deepEqual(b.sequence, a.sequence, 'receipt identity and order are deterministic');
  assert.equal(b.credits, a.credits, 'credits are deterministic');
});

// ── 7. reload mid-chain ─────────────────────────────────────────────────────────────────────

test('a save taken mid-chain resumes the same stores and credits, without a second note', () => {
  const a = chainHost();
  addCargo(a.h.state, IRON, 100);
  assert.equal(a.h.sys.deliverToClaim(a.refinery.id, IRON, 100), 100);
  runSim(a.h, 200, 1);

  const snap = JSON.parse(JSON.stringify(a.h.sys.serialize()));
  const b = boot();
  b.sys.deserialize(snap);
  b.state.simTime = a.h.state.simTime;
  b.state.player.credits = a.h.state.player.credits;

  runSim(a.h, 400, 1);
  runSim(b, 400, 1);

  const find = (h, specId) => h.state.claims.bodies.find((x) => x.spec && x.spec.id === specId);
  assert.deepEqual(find(b, 'spec_refinery').spec.store, find(a.h, 'spec_refinery').spec.store,
    'the refinery store survives the reload exactly');
  assert.deepEqual(find(b, 'spec_relay').spec.store, find(a.h, 'spec_relay').spec.store,
    'the relay store survives the reload exactly');
  assert.equal(b.state.player.credits, a.h.state.player.credits, 'credits match the uninterrupted run');
  assert.equal(receiptEvents(b, 'recipe_book_unified').length, 0,
    'a current save is not noted as a recipe-book migration');
});

// ── 8. old-save migration ───────────────────────────────────────────────────────────────────

test('a pre-recipe-book refinery keeps every stored good and says once what changed', () => {
  const h = boot();
  h.sys.deserialize({
    specVersion: 1,
    bodies: [{
      id: 'claim_1', sectorId: LAWFUL, poiId: 'poi_old_refinery', name: 'Old Refinery',
      size: 'M', slots: 3, modules: ['mod_refinery'], linkedStationId: null, x: 0, z: 0, claimedAt: 5,
      spec: {
        id: 'spec_refinery', since: 0, status: 'active', statusUntil: 0,
        store: {
          input: { cmdty_ore_copper: 10, cmdty_ore_platinoid: 4 },
          output: { cmdty_comp_circuitry: 3 },
        },
        convoy: null, acc: 0, nextDispatchAt: 0, destStationId: null, upkeepDebt: 0,
        deterrenceUntil: 0, outputFull: false, receipts: [], defense: null,
        totals: {
          refinedTotalU: 3, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0,
        },
      },
    }],
  });
  const body = h.state.claims.bodies[0];
  assert.equal(body.spec.store.output.cmdty_comp_circuitry, 3, 'stored output is untouched');

  // The player's real collection route recovers both the output and the stranded input.
  assert.equal(h.sys.collectFromClaim(body.id), 7,
    'collect ships the output and the unaccepted input together');
  assert.equal(h.state.player.cargo.items.cmdty_comp_circuitry, 3, 'stored output reaches the hold');
  assert.equal(h.state.player.cargo.items.cmdty_ore_platinoid, 4,
    'stranded platinoid reaches the hold with its identity and quantity');
  assert.equal(body.spec.store.input.cmdty_ore_platinoid, undefined, 'the stranded shelf is empty');
  assert.equal(h.state.player.cargo.items.cmdty_ore_copper, undefined,
    'copper stays on the site to be refined');

  const notes = receiptEvents(h, 'recipe_book_unified', body.id);
  assert.equal(notes.length, 1, 'exactly one migration note');
  assert.deepEqual(notes[0].payload.receipt.data, { stranded: ['cmdty_ore_platinoid'], copper: true });
  assert.equal(body.spec.recipeBook, 1, 'the save is stamped with the unified recipe book');

  const snap = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = boot();
  h2.sys.deserialize(snap);
  assert.equal(receiptEvents(h2, 'recipe_book_unified').length, 0, 'reloading never repeats the note');
  assert.equal(h2.state.claims.bodies[0].spec.receipts.filter((r) => r.kind === 'recipe_book_unified').length, 1,
    'the one note is preserved, not duplicated');

  runSim(h2, 60, 1);
  assert.equal(h2.state.claims.bodies[0].spec.store.output[REFINED], 5,
    'the stored copper now smelts to refined metals');
});

// ── 8b. empty output store: the stranded input is still a player-route action ────────────────

test('an empty-output refinery with stranded input still offers Collect on the Base screen', () => {
  const h = boot();
  h.sys.deserialize({
    specVersion: 1,
    bodies: [{
      id: 'claim_1', sectorId: LAWFUL, poiId: 'poi_stranded_only', name: 'Stranded Refinery',
      size: 'M', slots: 3, modules: ['mod_refinery'], linkedStationId: null, x: 0, z: 0, claimedAt: 5,
      spec: {
        id: 'spec_refinery', since: 0, status: 'active', statusUntil: 0,
        store: { input: { cmdty_ore_platinoid: 4 }, output: {} },
        convoy: null, acc: 0, nextDispatchAt: 0, destStationId: null, upkeepDebt: 0,
        deterrenceUntil: 0, outputFull: false, receipts: [], defense: null,
        totals: {
          refinedTotalU: 0, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0,
        },
      },
    }],
  });
  const body = h.state.claims.bodies[0];
  runSim(h, 60, 1);
  const led = h.sys.ledger(body.id);
  assert.equal(led.stores.outputU, 0, 'nothing refinable, so the output store stays empty');
  assert.equal(led.stores.strandedInputU, 4, 'the ledger exposes the recoverable input quantity');
  assert.equal(receiptEvents(h, 'recipe_book_unified', body.id).length, 1,
    'the migration note still says what changed');

  // The player route, not a hidden method: Base renders Collect whenever output OR recoverable
  // stranded input exists. With an empty output store that is the only way the good comes back.
  const baseSrc = readFileSync(new URL('../src/ui/screens/base.js', import.meta.url), 'utf8');
  assert.match(baseSrc, /ledger\.stores\.strandedInputU/,
    'the Base screen gates Collect on the recoverable input as well as output');

  assert.equal(h.sys.collectFromClaim(body.id), 4, 'the offered Collect action recovers the goods');
  assert.equal(h.state.player.cargo.items.cmdty_ore_platinoid, 4,
    'stranded platinoid reaches the hold with its identity and quantity');
  assert.equal(h.sys.ledger(body.id).stores.strandedInputU, 0, 'the stranded shelf is empty');
  assert.equal(h.sys.ledger(body.id).stores.outputU, 0, 'collecting stranded goods did not fake output');
});
