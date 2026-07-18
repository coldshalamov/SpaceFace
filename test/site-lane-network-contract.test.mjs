// A10 — "Power and material lanes remain topology-driven networks with explicit ownership and
// storage semantics." CHARACTERIZATION, not red-first: the gap analysis found no defect on the
// primary path, and every assertion below passes against unmodified HEAD. These tests pin the
// eight invariants A10's outcome statement asserts but which nothing exercised today.
//
// The required proofs, mapped to tests:
//   SPLIT            → §1 pure + §2 system
//   MERGE            → §3 pure (the summing branch at siteLogistics.js:118-121) + §4 system
//   REBUILD          → §5
//   DUPLICATE INIT   → §7
//   SAVE ORDER       → §8
//   NO ITEM-SIM DRIFT→ §9
// plus TIE DETERMINISM (§6), KEY CONTAINMENT (§10), and two characterizations of
// correct-but-unspecified behaviour (§11 merge over-capacity, §12 site-wide material pool).
//
// Determinism rules (test/AGENTS.md): no DOM, no wall clock, no Math.random — seeded state only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { buildComponents, reconcileStores, laneCapacity, storeTotal } from '../src/systems/siteLogistics.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const { COLS } = DRILL_CONST;
const EPS = 1e-9;

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });

function makeBus() {
  const handlers = new Map();
  return {
    events: [],
    handlers,
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

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 },
    entities, playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 400, cmdty_control_unit: 80, cmdty_refined_metals: 120,
          cmdty_electronics: 80, cmdty_purified_silica: 60,
        },
        usedVolume: 0, usedMass: 0, capVolume: 9000, capMass: 14000,
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
  const registry = {
    get(name) {
      return name === 'automation'
        ? { creditPassive: (gross) => Math.round(gross * 0.5) }
        : null;
    },
  };
  const sys = Object.create(asteroidSites);
  const ctx = { state, bus, helpers, registry };
  sys.init(ctx);
  return { sys, state, bus, entities, helpers, spawned, ctx };
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
  h.entities.get(asteroidId).data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
// A hollow corridor far from every machine, so lane cells painted here form PURE-OVERLAY networks
// (no machine conducting). Cutting it produces genuine splits; machines can't bridge it back.
const CORRIDOR = [[4, 20], [5, 20], [6, 20], [7, 20], [8, 20]];

const idx = (col, row) => tileIndex(col, row);
const laneTotal = (site) => site.laneStores.reduce((sum, l) => sum + storeTotal(l.store), 0);
const laneWith = (site, cell) => site.laneStores.find((l) => l.cells.includes(cell));
const shape = (site) => JSON.stringify(site.laneStores);

/** An anchored site (extractor + core) on a rock that also owns the far CORRIDOR. */
function anchoredSite() {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, [...POCKET, ...CORRIDOR]);
  const r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(r.ok, true, 'extractor installs');
  const core = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(core.ok, true, 'core installs and anchors');
  const site = h.sys.getSite(r.siteId);
  assert.equal(site.anchored, true);
  return { h, siteId: r.siteId, site };
}

function paintCorridor(h, siteId, cells = CORRIDOR) {
  for (const [c, r] of cells) {
    const res = h.sys.setOverlay(siteId, 'lane', c, r, true);
    assert.equal(res.ok, true, `lane paint at ${c},${r}`);
  }
}

// ============================================================ 1. SPLIT (pure)

test('SPLIT (pure): a network breaking in two conserves every unit and the whole balance lands on the majority component', () => {
  // 3-cell lane holding 60u; cell 40 is severed → 1 cell one side, 2 the other.
  // The fixture is deliberately INVERTED against the tie-break: the majority component (net41,
  // 2 votes) is NOT the lexicographically lowest key — 'net40' < 'net41'. So only a real vote-COUNT
  // majority can land the stock on net41; a presence-only tally would tie 1-1 and hand it to net40.
  const prev = [{ cells: [40, 41, 42], store: { cmdty_silicate: 60 } }];
  const comps = [{ key: 'net40', cells: [40] }, { key: 'net41', cells: [41, 42] }];
  const map = reconcileStores(prev, comps);
  // The WHOLE balance moves — reconcileStores re-homes, it never pro-rates.
  assert.equal(map.net41.cmdty_silicate, 60, 'the MAJORITY component takes the whole balance');
  assert.deepEqual(map.net40, {}, 'the minority half gets nothing, not a share');
  const after = storeTotal(map.net40) + storeTotal(map.net41);
  assert.equal(after, 60, 'aggregate conserved across the split');
});

// ========================================================== 2. SPLIT (system)

test('SPLIT (system): cutting a loaded lane in two conserves the site total and hands it to the majority side', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);

  const spur = laneWith(site, idx(4, 20));
  assert.ok(spur, 'corridor formed its own pure-overlay network');
  assert.deepEqual(spur.cells, CORRIDOR.map(([c, r]) => idx(c, r)), 'five contiguous lane cells');
  spur.store.cmdty_silicate = 60;
  const before = laneTotal(site);

  // Cut at col 5 → [4] (1 cell) vs [6,7,8] (3 cells). A genuine majority, not a tie — and the cut
  // is placed so the MAJORITY side's key is lexicographically HIGHER than the minority's
  // ('net564' < 'net566'), the opposite of what the tie-break at siteLogistics.js:113 would pick.
  // Only a real vote-COUNT majority puts the stock on the [6,7,8] side.
  assert.equal(h.sys.setOverlay(siteId, 'lane', 5, 20, false).ok, true);
  h.sys._runtime(site);

  const major = laneWith(site, idx(6, 20));
  const minor = laneWith(site, idx(4, 20));
  assert.deepEqual(major.cells, [idx(6, 20), idx(7, 20), idx(8, 20)]);
  assert.deepEqual(minor.cells, [idx(4, 20)]);
  assert.equal(major.key, undefined, 'persisted lane records carry no key — cells identify them');
  assert.ok(`net${idx(4, 20)}` < `net${idx(6, 20)}`,
    'precondition: the minority component sorts FIRST, so lexicographic order cannot explain the result');
  assert.equal(major.store.cmdty_silicate, 60, 'majority component keeps the entire balance');
  assert.deepEqual(minor.store, {}, 'minority component is empty, not pro-rated');
  assert.equal(laneTotal(site), before, 'no units created or destroyed by the split');
});

// ============================================================ 3. MERGE (pure)

test('MERGE (pure): two stores collapsing onto one component sum per good and conserve the total', () => {
  // This is the summing branch at siteLogistics.js:118-121 — same good on BOTH prev stores, so
  // the `(target[goodId] || 0) + qty` accumulate is what produces the answer, not mere presence.
  const prev = [
    { cells: [40, 41], store: { cmdty_silicate: 30, cmdty_ore_iron: 5 } },
    { cells: [50, 51], store: { cmdty_silicate: 12 } },
  ];
  const comps = [{ key: 'net40', cells: [40, 41, 45, 50, 51] }];
  const map = reconcileStores(prev, comps);
  assert.equal(map.net40.cmdty_silicate, 42, '30 + 12 summed, not overwritten');
  assert.equal(map.net40.cmdty_ore_iron, 5, 'goods present on only one side survive');
  assert.equal(storeTotal(map.net40), 47, 'nothing dropped, nothing double-counted');
});

// ========================================================== 4. MERGE (system)

test('MERGE (system): bridging two loaded lane networks sums their stores per good', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId, [[4, 20], [5, 20], [7, 20], [8, 20]]); // deliberate gap at col 6
  h.sys._runtime(site);

  const left = laneWith(site, idx(4, 20));
  const right = laneWith(site, idx(7, 20));
  assert.notEqual(left, right, 'the gap keeps them two distinct networks');
  left.store.cmdty_silicate = 30;
  right.store.cmdty_silicate = 12;
  right.store.cmdty_ore_iron = 5;
  const before = laneTotal(site);

  assert.equal(h.sys.setOverlay(siteId, 'lane', 6, 20, true).ok, true); // bridge them
  h.sys._runtime(site);

  const merged = laneWith(site, idx(4, 20));
  assert.deepEqual(merged.cells, CORRIDOR.map(([c, r]) => idx(c, r)), 'one component now');
  assert.equal(merged.store.cmdty_silicate, 42, 'per-good sum across the merge');
  assert.equal(merged.store.cmdty_ore_iron, 5);
  assert.equal(laneTotal(site), before, 'merge conserves the site total');
  assert.equal(laneWith(site, idx(7, 20)), merged, 'no duplicate store left behind');
});

// ================================================================= 5. REBUILD

test('REBUILD: stripping every lane cell keeps machine-anchored stock and spills pure-overlay stock, and repainting does not resurrect it', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);                                  // pure-overlay network
  paintCorridor(h, siteId, [[13, 1], [13, 3]]);              // welded to the machines
  h.sys._runtime(site);

  const orphan = laneWith(site, idx(4, 20));
  const anchored = laneWith(site, idx(13, 2));               // holds the extractor's own cell
  assert.notEqual(orphan, anchored);
  orphan.store.cmdty_silicate = 40;
  anchored.store.cmdty_ore_iron = 25;
  const before = laneTotal(site);
  assert.equal(before, 65);

  // Strip EVERY lane overlay cell. Machines still stand, and machines conduct, so each machine
  // keeps a one-cell network of its own; the corridor has nothing left to stand on.
  for (const [c, r] of [...CORRIDOR, [13, 1], [13, 3]]) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, false).ok, true);
  }
  h.sys._runtime(site);

  assert.deepEqual(site.overlays.lane, [], 'no lane overlay remains');
  const survivor = laneWith(site, idx(13, 2));
  assert.ok(survivor, 'the extractor still owns a network (machines conduct)');
  assert.equal(survivor.store.cmdty_ore_iron, 25, 'machine-anchored stock survives a full strip');
  assert.equal(laneTotal(site), 25, 'the 40u on the pure-overlay corridor spilled');
  assert.ok(!site.laneStores.some((l) => l.store.cmdty_silicate > 0), 'spilled stock is gone, not relocated');

  // Repainting the identical corridor brings the network back EMPTY. Spill is permanent.
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  const repainted = laneWith(site, idx(4, 20));
  assert.deepEqual(repainted.cells, CORRIDOR.map(([c, r]) => idx(c, r)), 'same topology restored');
  assert.deepEqual(repainted.store, {}, 'repainting does NOT restore spilled stock');
  assert.equal(laneTotal(site), 25, 'still only the survivor');
});

// ======================================================= 6. TIE DETERMINISM

test('TIE: an exact vote tie resolves to the lowest LEXICOGRAPHIC key — net11 beats net8, net10 beats net9 — repeatably and across a save roundtrip', () => {
  // The comparator at siteLogistics.js:113 sorts keys as STRINGS and keeps the first max. A reader
  // of the `net<minIdx>` scheme would expect the lowest CELL INDEX to win; it does not. Both pairs
  // below are chosen so lexicographic and numeric order DISAGREE — that is the whole point.
  const tieA = reconcileStores(
    [{ cells: [8, 9, 11, 12], store: { cmdty_silicate: 60 } }],
    [{ key: 'net8', cells: [8, 9] }, { key: 'net11', cells: [11, 12] }],
  );
  assert.equal(tieA.net11.cmdty_silicate, 60, "'net11' < 'net8' as strings, so net11 wins the 2-2 tie");
  assert.deepEqual(tieA.net8, {});

  const tieB = reconcileStores(
    [{ cells: [9, 10, 20, 21], store: { cmdty_silicate: 60 } }],
    [{ key: 'net9', cells: [9, 20] }, { key: 'net10', cells: [10, 21] }],
  );
  assert.equal(tieB.net10.cmdty_silicate, 60, "'net10' < 'net9' as strings, so net10 wins");
  assert.deepEqual(tieB.net9, {});

  // Same inputs → same winner, every call. No iteration-order or insertion-order dependence.
  const repeat = reconcileStores(
    [{ cells: [8, 9, 11, 12], store: { cmdty_silicate: 60 } }],
    [{ key: 'net8', cells: [8, 9] }, { key: 'net11', cells: [11, 12] }],
  );
  assert.deepEqual(repeat, tieA);

  // ...and the same winner after a full save roundtrip with the tie still PENDING.
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = 60;
  // Cut the exact middle → [4,5] vs [7,8]: a 2-2 tie between net564 and net567.
  assert.equal(h.sys.setOverlay(siteId, 'lane', 6, 20, false).ok, true);
  h.sys._runtime(site);
  const liveWinner = laneWith(site, idx(4, 20));
  assert.deepEqual(liveWinner.cells, [idx(4, 20), idx(5, 20)]);
  assert.equal(liveWinner.store.cmdty_silicate, 60, 'lower-keyed half wins the tie in-session');
  assert.deepEqual(laneWith(site, idx(7, 20)).store, {});

  const blob = h.sys.serialize();
  h.sys.deserialize(JSON.parse(JSON.stringify(blob)));
  const reloaded = h.sys.getSite(siteId);
  h.sys._runtime(reloaded);
  assert.equal(laneWith(reloaded, idx(4, 20)).store.cmdty_silicate, 60, 'same winner after reload');
  assert.deepEqual(laneWith(reloaded, idx(7, 20)).store, {});
});

// ==================================================== 7. DUPLICATE-INIT NO-OP

test('DUPLICATE INIT: init() twice over live site state is a stock no-op (and re-subscribes the bus — characterized, not endorsed)', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = 33;

  const sitesRef = h.state.sites;
  const before = JSON.stringify(h.state.sites);
  const orderLen = h.state.sites.order.length;
  const nextNum = h.state.sites.nextSiteNum;
  const listenersBefore = new Map([...h.bus.handlers].map(([k, v]) => [k, v.length]));

  h.sys.init(h.ctx); // second init over live state (init only defaults `if (!state.sites)`)

  assert.equal(h.state.sites, sitesRef, 'the existing sites record is preserved by identity');
  assert.equal(JSON.stringify(h.state.sites), before, 'byte-identical after re-init');
  assert.equal(h.state.sites.order.length, orderLen);
  assert.equal(h.state.sites.nextSiteNum, nextNum);

  // A following reconcile must also be a no-op — re-init clears the runtime caches, so this
  // rebuilds components from scratch and must land on exactly the same persisted mapping.
  const reSite = h.sys.getSite(siteId);
  h.sys._runtime(reSite);
  assert.equal(JSON.stringify(h.state.sites), before, 'reconcile after re-init changes nothing');
  assert.equal(laneWith(reSite, idx(4, 20)).store.cmdty_silicate, 33, 'stock intact');

  // CHARACTERIZATION of the latent leak the gap analysis flagged: init() re-subscribes without
  // unsubscribing, so every bus listener count DOUBLES. Harmless today (all five handlers are
  // idempotent and registry.init() runs once per process), but it is real — pinned here so a
  // future hot-reload/scenario-restart path cannot introduce it silently a second time.
  for (const [name, count] of listenersBefore) {
    assert.equal(h.bus.handlers.get(name).length, count * 2,
      `re-init doubles the '${name}' listener — latent leak, see notes`);
  }
});

// ========================================================= 8. SAVE-ORDER ROUNDTRIP

test('SAVE ORDER: serializing with a topology change still pending conserves units on reload, and the result is a fixed point', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = 60;
  const before = laneTotal(site);

  // Change topology WITHOUT letting the reconcile run. setOverlay mutates overlays.lane and only
  // flags netDirty, so site.laneStores[].cells stays stale until the next _runtime. Saving here is
  // the NORMAL path (the player saves mid-edit), so this must be safe.
  assert.equal(h.sys.setOverlay(siteId, 'lane', 6, 20, false).ok, true);

  const blob = h.sys.serialize();
  const savedCells = blob.byId[siteId].laneStores.map((l) => l.cells);
  const savedTotal = blob.byId[siteId].laneStores.reduce((s, l) => s + storeTotal(l.store), 0);

  // PRECONDITION: prove we really are exercising the pending-topology path, not an already
  // reconciled state. The saved cells still contain the cell we just cleared.
  assert.ok(savedCells.some((cells) => cells.includes(idx(6, 20))),
    'saved laneStores.cells are legitimately STALE relative to overlays.lane');
  assert.ok(!site.overlays.lane.includes(idx(6, 20)), 'overlays.lane already dropped that cell');
  assert.equal(savedTotal, before, 'the save carries every unit');

  h.sys.deserialize(JSON.parse(JSON.stringify(blob)));
  const reloaded = h.sys.getSite(siteId);
  h.sys._runtime(reloaded); // first reconcile after load resolves the pending split

  assert.equal(laneTotal(reloaded), before, 'total units conserved across save + pending split');
  assert.equal(laneWith(reloaded, idx(4, 20)).store.cmdty_silicate, 60);
  const fixedPoint = shape(reloaded);

  // Idempotent under repeated reconcile.
  for (let i = 0; i < 3; i++) {
    h.sys._markDirty(siteId, { net: true });
    h.sys._runtime(reloaded);
    assert.equal(shape(reloaded), fixedPoint, `reconcile #${i + 2} is a no-op`);
  }

  // ...and a fixed point across a SECOND full roundtrip.
  const blob2 = h.sys.serialize();
  h.sys.deserialize(JSON.parse(JSON.stringify(blob2)));
  const twice = h.sys.getSite(siteId);
  h.sys._runtime(twice);
  assert.equal(shape(twice), fixedPoint, 'second roundtrip reaches the identical mapping');
  assert.equal(laneTotal(twice), before);
});

// ========================================================= 9. NO ITEM-SIM DRIFT

test('NO ITEM-SIM DRIFT: a closed book of units survives store → export buffer → pod → delivered/lost with no per-item state', () => {
  // Zero production on purpose: a core (power) plus a cargo port on one spine, seeded with an
  // exact quantity. Nothing can create units, so the ledger must close EXACTLY at every tick.
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const core = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  const siteId = core.siteId;
  const site = h.sys.getSite(siteId);
  const port = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 13, row: 2 });
  assert.equal(port.ok, true);
  for (const [c, r] of [[13, 1], [13, 3], [14, 2]]) {
    assert.equal(h.sys.setOverlay(siteId, 'power', c, r, true).ok, true);
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, true).ok, true);
  }
  h.state.drill = null; // player retracts; production runs on sim time
  h.sys._runtime(site);
  assert.deepEqual(site.machines.map((m) => m.defId), ['sm_massline_core', 'sm_cargo_port'],
    'no extractor and no refinery — nothing in this site can mint or consume units');

  const rt = h.sys._rt.get(siteId);
  const store = rt.stores[rt.laneCompByMachine[port.machineId]];
  assert.ok(store, 'the port is on a lane network');
  const N = 96;
  store.cmdty_silicate = N;
  h.sys.setExportFlag(siteId, 'cmdty_silicate', true);
  site.fleet.podsReady = 20; // bypass the fabricator: this test is about transport, not building

  let deliveredU = 0;
  let lostU = 0;
  h.bus.on('site:courierDelivered', (p) => { deliveredU += p.units; });
  h.bus.on('site:courierLost', (p) => { lostU += storeTotal(p.cargo); });

  const book = () => laneTotal(site)
    + storeTotal(site.exportBuffer)
    + site.fleet.inFlight.reduce((sum, pod) => sum + storeTotal(pod.cargo), 0)
    + deliveredU + lostU;

  let worstDrift = 0;
  for (let i = 0; i < 1400; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
    worstDrift = Math.max(worstDrift, Math.abs(book() - N));
  }

  // Checked at EVERY tick, not just the end: no stage of the chain leaks or duplicates.
  assert.ok(worstDrift < 1e-6, `units conserved at every tick (worst drift ${worstDrift})`);
  assert.ok(Math.abs(book() - N) < 1e-6, 'the book closes on the seeded quantity');

  // The run must actually have moved goods, or the conservation above is vacuous.
  assert.ok(site.fleet.launches >= 2, `expected several launches, got ${site.fleet.launches}`);
  assert.ok(deliveredU > 0, 'at least one pod delivered');
  assert.equal(site.stats.exportedU, deliveredU, 'the stat matches the delivered events exactly');
  assert.equal(site.fleet.delivered + site.fleet.lost, site.fleet.launches - site.fleet.inFlight.length);
  assert.ok(laneTotal(site) < EPS, 'the store drained — goods really did flow through the port');

  // STRUCTURAL: every quantity anywhere in the chain is a plain scalar. There is no per-item
  // record, no id, no array of chunks — which is exactly why the conservation above is exact.
  for (const lane of site.laneStores) {
    for (const [good, qty] of Object.entries(lane.store)) {
      assert.equal(typeof qty, 'number', `lane store ${good} is a scalar`);
      assert.ok(Number.isFinite(qty));
    }
  }
  for (const [good, qty] of Object.entries(site.exportBuffer)) {
    assert.equal(typeof qty, 'number', `export buffer ${good} is a scalar`);
  }
  for (const pod of site.fleet.inFlight) {
    for (const [good, qty] of Object.entries(pod.cargo)) {
      assert.equal(typeof qty, 'number', `pod cargo ${good} is a scalar`);
    }
  }
});

// ========================================================== 10. KEY CONTAINMENT

test('KEY CONTAINMENT: component keys track the minimum cell index and shift under topology change, but only `cells` is ever persisted', () => {
  // The key is derived, not owned: extending a network downward renames it.
  assert.deepEqual(buildComponents(new Set([50, 51, 52]), new Map(), COLS).map((c) => c.key), ['net50']);
  assert.deepEqual(buildComponents(new Set([49, 50, 51, 52]), new Map(), COLS).map((c) => c.key), ['net49']);

  // Which is precisely why asteroidSites.js:265 persists `{cells, store}` and never `key`:
  // key churn under a topology change cannot corrupt stored stock.
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  laneWith(site, idx(5, 20)).store.cmdty_silicate = 20;

  for (const lane of site.laneStores) {
    assert.deepEqual(Object.keys(lane).sort(), ['cells', 'store'],
      'persisted lane records carry cells + store only — no component key');
  }
  const blob = h.sys.serialize();
  for (const lane of blob.byId[siteId].laneStores) {
    assert.equal(lane.key, undefined, 'no component key reaches the save file');
  }

  // Now force every key to shift, and confirm the stock followed the CELLS, not the key:
  // dropping the lowest cell (4,20) renames the component net<4,20> → net<5,20>.
  const rtBefore = h.sys._rt.get(siteId);
  const keyBefore = rtBefore.laneComps.find((c) => c.cells.includes(idx(5, 20))).key;
  assert.equal(keyBefore, `net${idx(4, 20)}`);
  assert.equal(h.sys.setOverlay(siteId, 'lane', 4, 20, false).ok, true);
  h.sys._runtime(site);
  const rtAfter = h.sys._rt.get(siteId);
  const keyAfter = rtAfter.laneComps.find((c) => c.cells.includes(idx(5, 20))).key;
  assert.equal(keyAfter, `net${idx(5, 20)}`, 'the component key shifted with the new minimum cell');
  assert.notEqual(keyAfter, keyBefore);
  assert.equal(laneWith(site, idx(5, 20)).store.cmdty_silicate, 20, 'stock survived the key rename');
});

// ===================================== 11. CHARACTERIZATION: merge over-capacity

test('CHARACTERIZATION: merging two full networks produces a store ABOVE the merged capacity (no clamp, no ruling)', () => {
  const { h, siteId, site } = anchoredSite();
  // Two isolated single-cell lane networks, each capacity laneStoreBase + 1 cell = 92u.
  for (const [c, r] of [[4, 20], [6, 20]]) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, true).ok, true);
  }
  h.sys._runtime(site);
  const rt = h.sys._rt.get(siteId);
  const capOne = SITE_BALANCE.laneStoreBase + SITE_BALANCE.laneStorePerCell;
  assert.equal(capOne, 92);
  for (const cell of [idx(4, 20), idx(6, 20)]) {
    const comp = rt.laneComps.find((c) => c.cells.length === 1 && c.cells[0] === cell);
    assert.equal(rt.capacity[comp.key], capOne);
    laneWith(site, cell).store.cmdty_silicate = capOne; // filled to the brim
  }

  assert.equal(h.sys.setOverlay(siteId, 'lane', 5, 20, true).ok, true); // bridge them
  h.sys._runtime(site);
  const rt2 = h.sys._rt.get(siteId);
  const merged = rt2.laneComps.find((c) => c.cells.includes(idx(4, 20)));
  const capMerged = laneCapacity(merged, () => 0);
  assert.equal(capMerged, SITE_BALANCE.laneStoreBase + 3 * SITE_BALANCE.laneStorePerCell);
  assert.equal(capMerged, 116);
  assert.equal(laneWith(site, idx(4, 20)).store.cmdty_silicate, 184, '92 + 92, unclamped');
  assert.ok(storeTotal(laneWith(site, idx(4, 20)).store) > capMerged,
    '68u over cap — reconcileStores never consults laneCapacity');

  // Consequence is graceful, not lossy: roomFor() reports zero, so machines report backlogged
  // until a port drains it. PINNED AS-IS — clamping here would destroy stock and no design
  // ruling exists. See sharedChangeRequests.
  const proj = h.sys.projection(siteId);
  const net = proj.lanes.find((n) => n.cells.includes(idx(4, 20)));
  assert.equal(net.stored, 184);
  assert.ok(net.stored > net.capacity, 'the projection reports the over-capacity honestly');
});

// ============================== 12. CHARACTERIZATION: site-wide construction pool

test('CHARACTERIZATION: install materials are drawn from ANY lane network on the site, including a fully disconnected one', () => {
  // Most on-point for A10's "explicit ownership" wording. _missingMaterials / _consumeMaterials
  // iterate ALL site.laneStores regardless of connectivity, so a network on the far side of the
  // asteroid — sharing no cell, no cable and no lane with the build site — silently funds the
  // build. Recorded as today's behaviour; whether this is an intended site-wide construction pool
  // or an ownership violation needs a ruling. See sharedChangeRequests.
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);

  const far = laneWith(site, idx(4, 20));
  const near = laneWith(site, idx(13, 2));
  assert.notEqual(far, near, 'the corridor shares no cell with the machines');
  assert.ok(!far.cells.some((cell) => near.cells.includes(cell)), 'genuinely disjoint networks');
  far.store.cmdty_regocrete = 50;

  const cargoBefore = h.state.player.cargo.items.cmdty_regocrete;
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 3 });
  assert.equal(res.ok, true);

  assert.equal(h.state.player.cargo.items.cmdty_regocrete, cargoBefore,
    'the ship hold was not touched');
  assert.ok(far.store.cmdty_regocrete < 50,
    'the DISCONNECTED network paid for a machine it has no connection to');
  assert.equal(far.store.cmdty_regocrete, 45, 'exactly the cargo port cost, drawn remotely');
});
