// A10 — "Power and material lanes remain topology-driven networks with explicit ownership and
// storage semantics." Primary-path invariants plus the design rulings (ownership-scoped funding,
// refuse-then-confirm spills, exact over-capacity diagnostics, numeric-safety ceiling).
//
// The required proofs, mapped to tests:
//   SPLIT             → §1 pure + §2 system
//   MERGE             → §3 pure + §4 system
//   REBUILD           → §5 (refuse-then-confirm spill flow)
//   TIE DETERMINISM   → §6
//   DUPLICATE INIT    → §7
//   SAVE ORDER        → §8
//   NO ITEM-SIM DRIFT → §9 (exact integer ledger)
//   KEY CONTAINMENT   → §10
//   MERGE OVER-CAP    → §11 (lossless, unclamped; hard-coded capacity literals)
//   OWNERSHIP (−)     → §12 disconnected install cell → ship cargo only
//   OWNERSHIP (+)     → §13 adjacent/bridged install cell → owning store first
//   INTAKE BLOCK      → §14 over-capacity blocks intake; exact overCapacity; drain works
//   EXTREME MERGE     → §15 STORE_NUMERIC_CEILING saturation
//   PREFLIGHT API     → §16 previewOverlayRemoval non-mutating + matches confirm
//
// Determinism rules (test/AGENTS.md): no DOM, no wall clock, no Math.random — seeded state only.
// Catalog decoupling: harness boots with live COMMODITIES (drives the real system), but no
// assertion may derive its expected value from SITE_BALANCE / COMMODITIES / live catalog imports.
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import {
  buildComponents, reconcileStores, laneCapacity, storeTotal,
  wouldOwnComponent, STORE_NUMERIC_CEILING,
} from '../src/systems/siteLogistics.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { COMMODITIES } from '../src/data/commodities.js';

// Hand-copied from SITE_BALANCE (src/data/sites.js). NOT imported — assertions must not track
// live catalog drift silently. Update consciously if the shipped balance changes.
const LANE_STORE_BASE = 80;
const LANE_STORE_PER_CELL = 12;
// 1-cell pure-overlay network: 80 + 12 = 92. 3-cell: 80 + 36 = 116.
const CAP_1CELL = 92;
const CAP_3CELL = 116;
// Hand-copied cargo-port install cost (sm_cargo_port in SITE_MACHINES).
const PORT_COST_REGOCRETE = 5;
const PORT_COST_CONTROL_UNIT = 1;
const PORT_COST_ELECTRONICS = 1;
// Number.MAX_SAFE_INTEGER — independent literal of STORE_NUMERIC_CEILING.
const SAFE_INTEGER_CEILING = 9007199254740991;

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
  //
  // A10 RULING FLOW: removals that leave the corridor store SOME cell to live on succeed
  // freely, but the removal that would orphan its last cell is REFUSED with the exact would-
  // spill preview, preserves all state, and needs an explicit confirmSpill — the confirmed
  // loss then lands a deterministic receipt (site:laneSpilled + a ledger line).
  const corridorButLast = CORRIDOR.slice(0, -1);
  for (const [c, r] of corridorButLast) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, false).ok, true);
  }
  const [lastC, lastR] = CORRIDOR[CORRIDOR.length - 1];
  const refused = h.sys.setOverlay(siteId, 'lane', lastC, lastR, false);
  assert.equal(refused.ok, false, 'the spilling removal is refused without confirmation');
  assert.equal(refused.reason, 'would-spill');
  assert.equal(refused.spill.spilledTotal, 40, 'the preview names the exact would-spill amount');
  assert.ok(site.overlays.lane.includes(idx(lastC, lastR)),
    'a refused removal leaves the overlay cell in place');
  assert.equal(laneTotal(site), 65, 'a refused removal spills nothing');

  const spillEvents = [];
  h.bus.on('site:laneSpilled', (p) => spillEvents.push(p));
  const confirmed = h.sys.setOverlay(siteId, 'lane', lastC, lastR, false, { confirmSpill: true });
  assert.equal(confirmed.ok, true, 'the confirmed removal proceeds');
  assert.equal(confirmed.spilled, 40, 'the receipt totals the confirmed loss');
  assert.equal(spillEvents.length, 1, 'exactly one deterministic spill receipt');
  assert.equal(spillEvents[0].spilledTotal, 40);
  assert.deepEqual(spillEvents[0].goods, { cmdty_silicate: 40 });

  for (const [c, r] of [[13, 1], [13, 3]]) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, false).ok, true,
      'machine-welded cells never orphan the machine-anchored store (machines conduct)');
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

test('DUPLICATE INIT: init() twice over live site state is a stock no-op AND a listener no-op (A10 repair)', () => {
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

  // The latent leak the round-1 review flagged is REPAIRED: subscriptions are idempotent per
  // bus (init against the SAME bus wires nothing new; a fresh bus wires fresh). A re-init must
  // leave every listener count exactly where it was.
  for (const [name, count] of listenersBefore) {
    assert.equal(h.bus.handlers.get(name).length, count,
      `re-init must not change the '${name}' listener count`);
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

  // Bounded-error contract (not the soft 1e-6 epsilon the round-1 review rejected).
  // The chain floors to whole units; residual is IEEE noise on summed scalars (~1e-12 observed).
  // BOOK_RESIDUAL_BOUND is the MAXIMUM permitted |book() - N| at any sample — hard-coded literal.
  // Mutation probes (finish protocol), applied as a one-shot storeTotal deletion while store == N:
  //   • at-bound (delete exactly 1e-9): stays GREEN — "inside contract"
  //     (IEEE: |96 - (96 - 1e-9)| is ~1.0000036e-9; withinBound admits relative 1e-5 of the bound
  //     so the exact-bound deletion is inside, while 2×bound stays outside).
  //   • beyond-bound (delete 2e-9 = 2× bound): REDS.
  //   • 1e-7 deletion: REDS (the classic soft-epsilon escape the review rejected).
  // Samples include the SEED (before any transfer) so a seed-time deletion cannot hide.
  const BOOK_RESIDUAL_BOUND = 1e-9;
  const withinBound = (drift) => (
    drift <= BOOK_RESIDUAL_BOUND
    || Math.abs(drift - BOOK_RESIDUAL_BOUND) / BOOK_RESIDUAL_BOUND < 1e-5
  );
  let worstDrift = Math.abs(book() - N);
  assert.ok(withinBound(worstDrift), `seeded book closed within bound (drift ${worstDrift})`);
  for (let i = 0; i < 1400; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
    worstDrift = Math.max(worstDrift, Math.abs(book() - N));
  }

  // Checked at EVERY tick, not just the end: no stage of the chain leaks or duplicates.
  assert.ok(
    withinBound(worstDrift),
    `units conserved within BOOK_RESIDUAL_BOUND=${BOOK_RESIDUAL_BOUND} (worst drift ${worstDrift})`,
  );
  assert.ok(
    withinBound(Math.abs(book() - N)),
    'the book closes on the seeded quantity within the residual bound',
  );

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

// ===================================== 11. MERGE OVER-CAPACITY (lossless, unclamped)

test('A10 RULING: merging two full networks produces a store ABOVE the merged capacity (no clamp)', () => {
  const { h, siteId, site } = anchoredSite();
  // Two isolated single-cell lane networks, each capacity CAP_1CELL = 92u (hand-copied math).
  for (const [c, r] of [[4, 20], [6, 20]]) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, true).ok, true);
  }
  h.sys._runtime(site);
  const rt = h.sys._rt.get(siteId);
  for (const cell of [idx(4, 20), idx(6, 20)]) {
    const comp = rt.laneComps.find((c) => c.cells.length === 1 && c.cells[0] === cell);
    assert.equal(rt.capacity[comp.key], CAP_1CELL);
    laneWith(site, cell).store.cmdty_silicate = CAP_1CELL; // filled to the brim
  }

  assert.equal(h.sys.setOverlay(siteId, 'lane', 5, 20, true).ok, true); // bridge them
  h.sys._runtime(site);
  const rt2 = h.sys._rt.get(siteId);
  const merged = rt2.laneComps.find((c) => c.cells.includes(idx(4, 20)));
  const capMerged = laneCapacity(merged, () => 0);
  assert.equal(capMerged, CAP_3CELL, '3-cell pure network = 80 + 3*12 = 116');
  assert.equal(laneWith(site, idx(4, 20)).store.cmdty_silicate, 184, '92 + 92, unclamped');
  assert.ok(storeTotal(laneWith(site, idx(4, 20)).store) > capMerged,
    '68u over cap — reconcileStores never consults laneCapacity');

  // Lossless merge, explicit pressure: projection reports exact over-capacity (never silent clamp).
  const proj = h.sys.projection(siteId);
  const net = proj.lanes.find((n) => n.cells.includes(idx(4, 20)));
  assert.equal(net.stored, 184);
  assert.equal(net.capacity, CAP_3CELL);
  assert.equal(net.overCapacity, 184 - CAP_3CELL, 'exact overCapacity = stored - capacity');
  assert.ok(net.stored > net.capacity, 'the projection reports the over-capacity honestly');
});

// ============================== 12. CHARACTERIZATION: site-wide construction pool

test('A10 RULING: construction may draw only from ship cargo plus the lane component that would own the install cell', () => {
  // The ruled behaviour (formerly a characterization of the reviewed defect, when
  // _missingMaterials / _consumeMaterials iterated ALL site.laneStores regardless of
  // connectivity): a network on the far side of the asteroid — sharing no cell, no cable and no
  // lane with the build site — must NEVER silently fund the build. The install cell here reaches
  // no lane at all, so the ship hold pays the full cost and the disconnected stock is untouched.
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

  // PORT_COST_REGOCRETE is the file-level hand-copied literal (catalog-decoupled).
  assert.equal(h.state.player.cargo.items.cmdty_regocrete, cargoBefore - PORT_COST_REGOCRETE,
    'the ship hold pays the FULL cost when no lane would own the install cell');
  assert.equal(far.store.cmdty_regocrete, 50,
    'the disconnected network keeps every unit — remote funding is dead');
});

// ===================================== 13. POSITIVE OWNERSHIP LAW

test('A10 RULING (+): construction draws from the owning lane store first, then ship cargo; a non-owning network is untouched', () => {
  // Mirror of §12: an install cell 4-adjacent to a lane (or bridged to it by the hypothetical
  // machine — machines conduct) IS funded by that component's store first, then ship cargo.
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  // Owning stub: lane at (14,2) is 4-adjacent to the install cell (14,3). Machines at (13,2)
  // and (14,1) also conduct into this component, but the FAR corridor remains a separate net.
  assert.equal(h.sys.setOverlay(siteId, 'lane', 14, 2, true).ok, true);
  h.sys._runtime(site);

  const far = laneWith(site, idx(4, 20));
  const near = laneWith(site, idx(14, 2));
  assert.notEqual(far, near, 'corridor and machine-side lane are distinct networks');
  assert.ok(!far.cells.some((cell) => near.cells.includes(cell)), 'genuinely disjoint');

  far.store.cmdty_regocrete = 50;
  // Partial fill: owning store covers control + electronics + 3 of 5 regocrete; ship pays the rest.
  near.store.cmdty_regocrete = 3;
  near.store.cmdty_control_unit = PORT_COST_CONTROL_UNIT;
  near.store.cmdty_electronics = PORT_COST_ELECTRONICS;

  const cargoRegBefore = h.state.player.cargo.items.cmdty_regocrete;
  const cargoCuBefore = h.state.player.cargo.items.cmdty_control_unit;
  const cargoElBefore = h.state.player.cargo.items.cmdty_electronics;

  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 3 });
  assert.equal(res.ok, true, 'install succeeds on a funded adjacent cell');

  assert.equal(near.store.cmdty_regocrete, 0, 'owning store paid its regocrete first');
  assert.equal(near.store.cmdty_control_unit, 0, 'owning store paid the control unit');
  assert.equal(near.store.cmdty_electronics, 0, 'owning store paid the electronics');
  assert.equal(
    h.state.player.cargo.items.cmdty_regocrete,
    cargoRegBefore - (PORT_COST_REGOCRETE - 3),
    'ship cargo pays only the residual regocrete the owning store could not cover',
  );
  assert.equal(h.state.player.cargo.items.cmdty_control_unit, cargoCuBefore,
    'ship cargo is not charged for goods the owning store already covered');
  assert.equal(h.state.player.cargo.items.cmdty_electronics, cargoElBefore,
    'ship cargo is not charged for electronics the owning store already covered');
  assert.equal(far.store.cmdty_regocrete, 50,
    'the non-owning network on the same site is untouched');
});

test('wouldOwnComponent: machines conduct, isolated cells are null, hypothetical-only is null', () => {
  // Direct pure pin of the ownership predicate (import wouldOwnComponent).
  // 1) Fully isolated cell — no lane, no neighbor machine → null.
  assert.equal(
    wouldOwnComponent(new Set(), new Map(), COLS, idx(4, 20)),
    null,
    'a fully isolated cell owns no lane component',
  );

  // 2) Hypothetical-only component: insert cell alone becomes a 1-cell component of the
  // hypothetical machine — that reaches no lane, so ownership is null (ship cargo only).
  assert.equal(
    wouldOwnComponent(new Set(), new Map(), COLS, idx(14, 3)),
    null,
    'hypothetical machine alone is not an owning network',
  );

  // 3) Machines conduct: lane at (13,3) + existing extractor at (13,2); install at (14,3) is
  // not itself on a painted lane, but the hypothetical machine bridges through the extractor
  // into the lane cell — so the returned component includes the lane.
  const laneOnly = new Set([idx(13, 3)]);
  const machines = new Map([[idx(13, 2), 'ext']]);
  const owned = wouldOwnComponent(laneOnly, machines, COLS, idx(14, 3));
  assert.ok(owned, 'hypothetical install reaches a lane through a conducting machine');
  assert.ok(owned.cells.includes(idx(13, 3)), 'the reached component includes the lane cell');
  assert.ok(owned.cells.includes(idx(14, 3)), 'the install cell is in the component');
  assert.ok(owned.cells.includes(idx(13, 2)), 'the conducting machine cell is in the component');
});

// ===================================== 14. INTAKE-BLOCK PIN

test('A10 RULING: over-capacity blocks intake (backlog + deposit refuse), reports exact overCapacity, and drains cleanly', () => {
  // Capacity math is hard-coded from shipped constants BY HAND (not derived from SITE_BALANCE
  // at assert time). CAP_1CELL=92, CAP_3CELL=116. Boundary fixtures: 115 / 116 / 117.
  const { h, siteId, site } = anchoredSite();
  const extractor = site.machines.find((m) => m.defId === 'sm_extractor');
  assert.ok(extractor, 'anchored site has the extractor');

  // --- (A) Merge two full pure-overlay nets into one small-capacity net -------------------
  for (const [c, r] of [[4, 20], [6, 20]]) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, true).ok, true);
  }
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = CAP_1CELL;
  laneWith(site, idx(6, 20)).store.cmdty_silicate = CAP_1CELL;
  assert.equal(h.sys.setOverlay(siteId, 'lane', 5, 20, true).ok, true);
  h.sys._runtime(site);

  const mergedStored = CAP_1CELL + CAP_1CELL; // 184
  const mergedOver = mergedStored - CAP_3CELL; // 68
  assert.equal(laneWith(site, idx(4, 20)).store.cmdty_silicate, mergedStored);
  let proj = h.sys.projection(siteId);
  let net = proj.lanes.find((n) => n.cells.includes(idx(4, 20)));
  assert.equal(net.capacity, CAP_3CELL);
  assert.equal(net.stored, mergedStored);
  assert.equal(net.overCapacity, mergedOver, 'exact overCapacity after lossless merge');
  assert.equal(net.intakeRoom, 0);

  // Boundary fixtures (independent literals 115 / 116 / 117 against capacity 116).
  // Re-fetch the live store each iteration: _runtime rebuilds laneStores and detaches old refs.
  for (const [qty, expectOver, expectRoom] of [
    [115, 0, 1],
    [116, 0, 0],
    [117, 1, 0],
  ]) {
    laneWith(site, idx(4, 20)).store.cmdty_silicate = qty;
    h.sys._markDirty(siteId, { net: true });
    h.sys._runtime(site);
    proj = h.sys.projection(siteId);
    net = proj.lanes.find((n) => n.cells.includes(idx(4, 20)));
    assert.equal(net.capacity, CAP_3CELL, `cap stable at qty=${qty}`);
    assert.equal(net.stored, qty);
    assert.equal(net.overCapacity, expectOver, `overCapacity at stored=${qty}`);
    assert.equal(net.intakeRoom, expectRoom, `intakeRoom at stored=${qty}`);
  }
  // Restore the merge overfill for later projection sanity.
  laneWith(site, idx(4, 20)).store.cmdty_silicate = mergedStored;
  h.sys._markDirty(siteId, { net: true });
  h.sys._runtime(site);

  // --- (B) Producing machine on an over-capacity network → backlogged / export ------------
  // Power + lane spine so the extractor can run; then overfill its lane store.
  assert.equal(h.sys.setOverlay(siteId, 'power', 14, 2, true).ok, true);
  assert.equal(h.sys.setOverlay(siteId, 'lane', 14, 2, true).ok, true);
  h.sys._runtime(site);
  const rt = h.sys._rt.get(siteId);
  const extKey = rt.laneCompByMachine[extractor.id];
  assert.ok(extKey, 'extractor is on a lane network');
  const extCap = rt.capacity[extKey];
  const OVERFILL = 50;
  rt.stores[extKey].cmdty_silicate = extCap + OVERFILL;
  // Persist the same quantity onto the laneStores record the runtime re-homes from.
  const extLane = site.laneStores.find((ls) => {
    const comp = rt.laneComps.find((c) => c.key === extKey);
    return comp && ls.cells.some((c) => comp.cells.includes(c));
  });
  assert.ok(extLane, 'persisted lane record for the extractor network');
  extLane.store.cmdty_silicate = extCap + OVERFILL;

  const totalBefore = storeTotal(rt.stores[extKey]);
  assert.equal(totalBefore, extCap + OVERFILL);
  for (let i = 0; i < 12; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }
  const st = h.sys.projection(siteId).machines.find((m) => m.id === extractor.id);
  assert.equal(st.status.state, 'backlogged', 'producing machine backs up when intake room is 0');
  assert.equal(st.status.limit, 'export');
  assert.equal(storeTotal(h.sys._rt.get(siteId).stores[extKey]), totalBefore,
    'backlogged production does NOT grow the store');

  // Deposit refuses while over capacity (roomFor → 0; a roomFor→Infinity mutant would accept).
  const dep = h.sys.transferGoods(siteId, extractor.id, 'cmdty_silicate', 5, 'deposit');
  assert.equal(dep.ok, false, 'deposit refused on an over-capacity network');
  assert.equal(dep.moved, 0);
  assert.equal(dep.reason, 'no-room-or-cargo');
  assert.equal(storeTotal(h.sys._rt.get(siteId).stores[extKey]), totalBefore,
    'refused deposit leaves the store unchanged');

  // --- (C) Drain via withdrawal → overCapacity falls to 0 exactly at stored == capacity ---
  const wd = h.sys.transferGoods(siteId, extractor.id, 'cmdty_silicate', OVERFILL, 'withdraw');
  assert.equal(wd.ok, true);
  assert.equal(wd.moved, OVERFILL);
  const rtAfter = h.sys._rt.get(siteId);
  const storedAfter = storeTotal(rtAfter.stores[extKey]);
  assert.equal(storedAfter, extCap, 'stored == capacity after draining the exact overfill');
  proj = h.sys.projection(siteId);
  const extNet = proj.lanes.find((n) => n.machineIds.includes(extractor.id));
  assert.ok(extNet);
  assert.equal(extNet.stored, extCap);
  assert.equal(extNet.capacity, extCap);
  assert.equal(extNet.overCapacity, 0, 'overCapacity is 0 exactly when stored == capacity');
  assert.equal(extNet.intakeRoom, 0);

  // One more unit of room: withdraw 1 more → intakeRoom 1, still overCapacity 0.
  const wd2 = h.sys.transferGoods(siteId, extractor.id, 'cmdty_silicate', 1, 'withdraw');
  assert.equal(wd2.ok, true);
  assert.equal(wd2.moved, 1);
  proj = h.sys.projection(siteId);
  const extNet2 = proj.lanes.find((n) => n.machineIds.includes(extractor.id));
  assert.equal(extNet2.overCapacity, 0);
  assert.equal(extNet2.intakeRoom, 1);
  assert.equal(extNet2.stored, extCap - 1);
});

// ===================================== 15. EXTREME MERGE

test('EXTREME MERGE: stores at the numeric edge saturate at STORE_NUMERIC_CEILING; sub-ceiling sums stay exact', () => {
  // Independent literal pins the constant — import AND hard-code so a constant rename/rewrite
  // that changes the value cannot silently re-green the suite.
  assert.equal(STORE_NUMERIC_CEILING, SAFE_INTEGER_CEILING);
  assert.equal(SAFE_INTEGER_CEILING, 9007199254740991);

  // Two 9e307 stores → sum far above the ceiling → saturate.
  const huge = reconcileStores(
    [
      { cells: [40], store: { cmdty_silicate: 9e307 } },
      { cells: [50], store: { cmdty_silicate: 9e307 } },
    ],
    [{ key: 'net40', cells: [40, 50] }],
  );
  assert.equal(huge.net40.cmdty_silicate, STORE_NUMERIC_CEILING);
  assert.equal(huge.net40.cmdty_silicate, 9007199254740991);
  assert.ok(Number.isFinite(huge.net40.cmdty_silicate), 'saturated value is finite');

  // 8e307 + 8e307 = 1.6e308, which ALSO exceeds the ceiling (and is past Number range for exact
  // sum). The defined result is saturation, not Infinity and not a "exact 1.6e308" claim.
  const alsoHuge = reconcileStores(
    [
      { cells: [40], store: { cmdty_silicate: 8e307 } },
      { cells: [50], store: { cmdty_silicate: 8e307 } },
    ],
    [{ key: 'net40', cells: [40, 50] }],
  );
  assert.equal(alsoHuge.net40.cmdty_silicate, STORE_NUMERIC_CEILING);
  assert.ok(Number.isFinite(alsoHuge.net40.cmdty_silicate));

  // Two 3e15 stores → exact sum (well below the ceiling).
  const mid = reconcileStores(
    [
      { cells: [40], store: { cmdty_silicate: 3e15 } },
      { cells: [50], store: { cmdty_silicate: 3e15 } },
    ],
    [{ key: 'net40', cells: [40, 50] }],
  );
  assert.equal(mid.net40.cmdty_silicate, 6e15);
  assert.ok(Number.isFinite(mid.net40.cmdty_silicate));

  // Number.isFinite on every store value in every populated stage of the system path too.
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId, [[4, 20], [6, 20]]);
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = 3e15;
  laneWith(site, idx(6, 20)).store.cmdty_silicate = 3e15;
  for (const lane of site.laneStores) {
    for (const qty of Object.values(lane.store)) {
      assert.ok(Number.isFinite(qty), 'pre-merge store values are finite');
    }
  }
  assert.equal(h.sys.setOverlay(siteId, 'lane', 5, 20, true).ok, true);
  h.sys._runtime(site);
  const merged = laneWith(site, idx(4, 20));
  assert.equal(merged.store.cmdty_silicate, 6e15);
  for (const lane of site.laneStores) {
    for (const qty of Object.values(lane.store)) {
      assert.ok(Number.isFinite(qty), 'post-merge store values are finite');
    }
  }
  const blob = h.sys.serialize();
  for (const lane of blob.byId[siteId].laneStores) {
    for (const qty of Object.values(lane.store)) {
      assert.ok(Number.isFinite(qty), 'serialized store values are finite');
    }
  }
});

// ===================================== 16. PREFLIGHT API CONTRACT

test('PREFLIGHT: previewOverlayRemoval is non-mutating, matches confirmed spill, and zeros power/non-overlay', () => {
  const { h, siteId, site } = anchoredSite();
  paintCorridor(h, siteId);
  h.sys._runtime(site);
  laneWith(site, idx(4, 20)).store.cmdty_silicate = 40;

  // Strip every corridor cell but the last so the final clear would spill.
  for (const [c, r] of CORRIDOR.slice(0, -1)) {
    assert.equal(h.sys.setOverlay(siteId, 'lane', c, r, false).ok, true);
  }
  const [lastC, lastR] = CORRIDOR[CORRIDOR.length - 1];
  assert.ok(site.overlays.lane.includes(idx(lastC, lastR)));

  // NON-MUTATING: byte-equal site state before/after preview.
  const before = JSON.stringify(site);
  const preview = h.sys.previewOverlayRemoval(siteId, 'lane', lastC, lastR);
  assert.equal(JSON.stringify(site), before, 'previewOverlayRemoval must not mutate site state');
  assert.equal(preview.spilledTotal, 40, 'preview names the exact would-spill total');
  assert.ok(site.overlays.lane.includes(idx(lastC, lastR)), 'overlay cell still present after preview');
  assert.equal(laneWith(site, idx(lastC, lastR)).store.cmdty_silicate, 40);

  // Matches what a confirmed removal then does.
  const confirmed = h.sys.setOverlay(siteId, 'lane', lastC, lastR, false, { confirmSpill: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.spilled, preview.spilledTotal,
    'preview.spilledTotal === confirmed.spilled');

  // Power-kind and non-overlay cells return zeros.
  assert.equal(h.sys.setOverlay(siteId, 'power', 14, 2, true).ok, true);
  const powerPrev = h.sys.previewOverlayRemoval(siteId, 'power', 14, 2);
  assert.equal(powerPrev.spilledTotal, 0);
  assert.deepEqual(powerPrev.spilled, []);
  assert.deepEqual(powerPrev.placed, []);

  const missing = h.sys.previewOverlayRemoval(siteId, 'lane', 4, 20); // already cleared
  assert.equal(missing.spilledTotal, 0);
  assert.deepEqual(missing.spilled, []);
  assert.deepEqual(missing.placed, []);
});
