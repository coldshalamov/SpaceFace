// Packet A05 — the sacred contact-ring rule (design/ASTEROID_SITES_BRIEF.md §1):
//   "hollowing permanently removes geological contact and yield potential."
//
// CHARACTERIZATION, NOT DEFECT. Every assertion in this file was green against the shipped code
// on the first run — the law is correctly implemented, it was simply unpinned. The point of the
// file is that the law is currently upheld by facts scattered across three files whose authors
// have no reason to know a site law depends on them:
//
//   1. asteroidSites.canInstall / installMachine reject non-empty tiles (`not-hollow`) — this is
//      the LOAD-BEARING access gate (solid<=7 is emergent only because machines sit on hollows
//      reached by drilling). A05 pins it through hard-coded at-bound / beyond-bound fixtures.
//   2. drill.js `applyClearedTiles` only ever writes EMPTY_TILE → `cleared` is monotone.
//   3. drill.js:441 `if (data && !data.siteId)` exempts site rocks from recoverClearedGeometry →
//      the single line standing between the shipped game and tunnels healing shut around a
//      player's machines. Deleting it leaves every other suite green.
//
// Determinism per test/AGENTS.md: seeded state, explicit state.simTime, no wall clock, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateDrillField, recoverClearedGeometry, entryShaftIndex, tileIndex, DRILL_CONST, drill,
} from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_BALANCE } from '../src/data/sites.js';

const { COLS, ROWS } = DRILL_CONST;

// PINNED yield rates — CURRENT shipped values, copied by hand from src/data/sites.js CONTACT_YIELD.
// Independent literals: a production rate change must consciously update these numbers.
// Do NOT import CONTACT_YIELD for expected-value computation (self-referential drift hole).
const PINNED_MATRIX_PER_MIN = 0.9;
const PINNED_BASALT_PER_MIN = 0.35;
// Both-sides numeric discipline for the exact yield-loss assertion.
const YIELD_EQ_TOL = 1e-9;
const YIELD_BEYOND_DRIFT = 0.01;

// Minimal LOCAL commodity footprints — only the fields cargo defOf reads (volPerU, massPerU).
// IDs match sites.js machine cost / output keys (production surface), not a live-catalog import.
// Renaming any id in src/data/commodities.js must not red this suite.
const LOCAL_COMMODITIES = Object.freeze([
  { id: 'cmdty_regocrete', volPerU: 1, massPerU: 1 },
  { id: 'cmdty_control_unit', volPerU: 1.2, massPerU: 0.8 },
  { id: 'cmdty_refined_metals', volPerU: 1, massPerU: 1 },
  { id: 'cmdty_electronics', volPerU: 1, massPerU: 1 },
  { id: 'cmdty_purified_silica', volPerU: 1, massPerU: 1 },
  { id: 'cmdty_silicate', volPerU: 1, massPerU: 1 },
]);

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const SOLID = () => ({ type: 'dirt', hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7 });

// The fixture pocket from test/asteroid-sites.test.mjs: a hand-drilled chamber around the entry
// shaft (col 14, row 0) carved into a REAL generated field, not a synthetic makeField().
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
const ROCK_ID = 42;

/** Fully solid constructed field — hard-coded geometry, not generator-sampled. */
function makeSolidField() {
  const field = [];
  for (let c = 0; c < COLS; c++) {
    field[c] = [];
    for (let r = 0; r < ROWS; r++) field[c][r] = SOLID();
  }
  return field;
}

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

/** asteroidSites + (optionally) the REAL drill system sharing one ctx, one bus, one state. */
function makeHarness({ withDrill = false } = {}) {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 },
    entities, playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12,
          cmdty_electronics: 8, cmdty_purified_silica: 6,
        },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    // Self-contained: no live COMMODITIES import. Cargo defOf prefers this registry.
    content: { commodities: LOCAL_COMMODITIES },
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
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  const sys = Object.create(asteroidSites);
  sys.init(ctx);
  let drillSys = null;
  if (withDrill) {
    drillSys = Object.create(drill);
    drillSys.init(ctx); // NOTE: sets state.drill = null — must run before openSession()
  }
  return { sys, drillSys, state, bus, entities, helpers, spawned };
}

function addAsteroid(h, id = ROCK_ID) {
  const ent = {
    id, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

/** Open a live drill session over a REAL generated field with the pocket hand-carved into it. */
function openSession(h, asteroidId = ROCK_ID, cells = POCKET) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(asteroidId);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

/** Extractor at 13,2 + Core at 14,1 (anchors the site and freezes boreSeed at the rock id). */
function buildAnchoredSite(h, asteroidId = ROCK_ID) {
  const ex = h.sys.installMachine({ asteroidId, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(ex.ok, true, 'extractor install');
  const core = h.sys.installMachine({ asteroidId, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(core.ok, true, 'core install');
  const site = h.sys.getSite(ex.siteId);
  assert.equal(site.anchored, true);
  return { site, siteId: ex.siteId, extractorId: ex.machineId, coreId: core.machineId };
}

const machineView = (h, siteId, machineId) => h.sys.projection(siteId).machines.find((m) => m.id === machineId);
const silicateOf = (view) => Number(view.capability.outputsPerMin.cmdty_silicate) || 0;

/**
 * Hollow one cell exactly the way drill.js does when the rover breaks a tile (drill.js ~873-883):
 * carve the live field, record it on the rock entity, THEN raise drill:break. All three matter —
 * the entity list is what a later session regenerates the field from, and asteroidSites replaces
 * site.cleared from it wholesale on drill:end.
 */
function hollowCell(h, col, row) {
  const d = h.state.drill;
  assert.ok(d && d.field, 'hollowCell needs a live session (drill:break is session-scoped)');
  d.field[col][row] = EMPTY();
  const ent = h.entities.get(d.asteroidId);
  const idx = tileIndex(col, row);
  if (ent && ent.data && !ent.data.drillCleared.includes(idx)) ent.data.drillCleared.push(idx);
  h.bus.emit('drill:break', { col, row });
}

const sorted = (list) => list.slice().sort((a, b) => a - b);

// ---------------------------------------------------------------- structural sample (characterization)

test('characterization: generateDrillField sample shows zero natural voids (not a universal gate)', () => {
  // OBSERVED characterization of current tileFor — NOT a load-bearing universal precondition.
  // The contact max/access invariant is pinned by the production canInstall empty-tile gate
  // (see "access law" below). A 60-seed sample cannot prove "no natural voids for all seeds";
  // a seed-61 cavern alone would not red this suite and must not be treated as the access law.
  let voids = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const field = generateDrillField(seed);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (field[c][r] && field[c][r].type === 'empty') voids++;
      }
    }
  }
  assert.equal(voids, 0, 'sample seeds 1..60 currently emit 100% solid fields (characterization)');
});

test('characterization: boundary/degenerate seeds stay finite; install gate holds', () => {
  // Probes magnitude discipline through generateDrillField's own seed coercion in _seededRng:
  //   let a = (seed | 0) || 1
  // Raw inputs include 0, 1, INT32 max, UINT32 max, and Number.MAX_VALUE.
  const RAW_SEEDS = [0, 1, 2147483647, 4294967295, Number.MAX_VALUE];
  for (const raw of RAW_SEEDS) {
    const coerced = (raw | 0) || 1;
    const field = generateDrillField(raw);
    assert.equal(field.length, COLS, `seed raw=${raw} coerced=${coerced}: COLS width`);
    for (let c = 0; c < COLS; c++) {
      assert.equal(field[c].length, ROWS, `seed raw=${raw}: ROWS at col ${c}`);
      for (let r = 0; r < ROWS; r++) {
        const tile = field[c][r];
        assert.ok(tile && typeof tile.type === 'string', `seed raw=${raw}: tile at ${c},${r}`);
        assert.ok(Number.isFinite(tile.hp), `seed raw=${raw}: finite hp at ${c},${r}`);
        assert.ok(Number.isFinite(tile.hardness), `seed raw=${raw}: finite hardness at ${c},${r}`);
        assert.ok(Number.isFinite(tile.maxHp), `seed raw=${raw}: finite maxHp at ${c},${r}`);
      }
    }

    // Install gate still holds on the generated field: solid cells reject placement.
    const h = makeHarness();
    addAsteroid(h);
    const col = 5;
    const row = 5;
    h.state.drill = {
      active: true, asteroidId: ROCK_ID, field,
      avatar: { col: col - 1, row },
    };
    const tile = field[col][row];
    if (tile.type !== 'empty') {
      const can = h.sys.canInstall({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
      assert.equal(can.ok, false, `seed raw=${raw}: solid cell must reject canInstall`);
      assert.equal(can.reason, 'not-hollow', `seed raw=${raw}: reason not-hollow`);
      const inst = h.sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
      assert.equal(inst.ok, false, `seed raw=${raw}: solid cell must reject installMachine`);
      assert.equal(inst.reason, 'not-hollow');
    }
  }
});

// ---------------------------------------------------------------- contact max / access invariant (load-bearing)

test('access law: canInstall/installMachine pin at-bound solid=7/empty=1 and beyond-bound not-hollow', () => {
  // PINNED (load-bearing). Hard-coded constructed drill fields — not generator samples.
  // At-bound: hollow placement cell + exactly one hollow ring neighbour → solid=7, empty=1.
  // Beyond-bound: no empty placement cell (fully solid) → un-installable via not-hollow.
  // The empty-tile install gate IS the access-invariant enforcement in current production.

  // --- At-bound solid=7 / empty=1: must install and produce ---
  {
    const h = makeHarness();
    const ent = addAsteroid(h);
    const field = makeSolidField();
    const col = 10;
    const row = 10;
    const accessCol = col;
    const accessRow = row - 1;
    field[col][row] = EMPTY();
    field[accessCol][accessRow] = EMPTY(); // one access neighbour (north)
    // Remaining 7 ring cells stay solid dirt → matrix contacts.
    // Durable projection rebuilds from generateDrillField(boreSeed)+cleared — both hollows
    // must be on the rock's drillCleared so site.cleared captures them on first install.
    ent.data.drillCleared = [tileIndex(col, row), tileIndex(accessCol, accessRow)];
    h.state.drill = {
      active: true, asteroidId: ROCK_ID, field,
      avatar: { col: accessCol, row: accessRow },
    };

    const can = h.sys.canInstall({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
    assert.equal(can.ok, true, 'at-bound hollow with solid=7 empty=1 must pass canInstall');
    assert.equal(can.profile.solid, 7, 'at-bound profile solid');
    assert.equal(can.profile.empty, 1, 'at-bound profile empty');
    assert.equal(can.profile.solid + can.profile.empty, 8);

    const inst = h.sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
    assert.equal(inst.ok, true, 'at-bound must installMachine');
    const site = h.sys.getSite(inst.siteId);
    assert.ok(site.cleared.includes(tileIndex(col, row)), 'placement cell is in durable cleared');
    assert.ok(site.cleared.includes(tileIndex(accessCol, accessRow)), 'access cell is in durable cleared');
    const view = machineView(h, inst.siteId, inst.machineId);
    assert.equal(view.geo.solid, 7, 'durable geo solid after install');
    assert.equal(view.geo.empty, 1, 'durable geo empty after install');
    assert.equal(view.geo.solid + view.geo.empty, 8);
    // Production: pinned rates × durable contact counts (not CONTACT_YIELD import).
    // Durable field regenerates virgin geology + cleared, so kinds may mix matrix/basalt.
    const expectedSilicate = Math.round(
      (view.geo.matrix * PINNED_MATRIX_PER_MIN + view.geo.basalt * PINNED_BASALT_PER_MIN) * 1000,
    ) / 1000;
    assert.equal(
      silicateOf(view),
      expectedSilicate,
      'at-bound extractor must produce from its solid contacts at pinned rates',
    );
    assert.ok(silicateOf(view) > 0, 'at-bound extractor must produce a positive silicate rate');
    assert.equal(view.capability.geologyLive, true);
  }

  // --- Beyond-bound solid=8 / empty=0 region: no empty cell accepts a machine ---
  {
    const h = makeHarness();
    addAsteroid(h);
    const field = makeSolidField(); // fully solid — contact around any cell is solid=8 if hollowed
    const col = 10;
    const row = 10;
    h.state.drill = {
      active: true, asteroidId: ROCK_ID, field,
      avatar: { col, row: row - 1 },
    };

    const can = h.sys.canInstall({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
    assert.equal(can.ok, false, 'beyond-bound solid target must fail canInstall');
    assert.equal(can.reason, 'not-hollow', 'beyond-bound reason must be not-hollow');

    const inst = h.sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_extractor', col, row });
    assert.equal(inst.ok, false, 'beyond-bound solid target must fail installMachine');
    assert.equal(inst.reason, 'not-hollow');
    assert.equal(h.state.sites.order.length, 0, 'rejected install must not create a site or produce');
  }
});

test('contact law: solid + empty === 8 and solid <= 7 on a real generated + drilled field', () => {
  // OBSERVED on the real pocket fixture; load-bearing access is the canInstall test above.
  const h = makeHarness();
  addAsteroid(h);
  const liveField = openSession(h);
  const { siteId } = buildAnchoredSite(h);

  const proj = h.sys.projection(siteId);
  assert.equal(proj.machines.length, 2);
  for (const m of proj.machines) {
    assert.equal(m.geo.cells.length, 8, `${m.defId} reads exactly 8 ring cells`);
    assert.equal(m.geo.solid + m.geo.empty, 8, `${m.defId}: every ring offset is solid xor empty`);
    assert.ok(m.geo.solid <= 7, `${m.defId}: a machine sits on a cell it drilled to, so >=1 access`);
    assert.ok(m.geo.empty >= 1, `${m.defId}: at least one hollow access neighbour`);
    // The typed counters must reconstruct `solid` exactly — nothing is double-counted or dropped.
    const oreCount = Object.values(m.geo.ores).reduce((s, n) => s + n, 0);
    assert.equal(m.geo.matrix + m.geo.basalt + m.geo.gas + oreCount, m.geo.solid);
  }

  // The durable record's regenerated field agrees cell-for-cell with the live session field:
  // contact is never stored, it is recomputed from generateDrillField(boreSeed) + cleared.
  const durable = proj.field;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      assert.equal(durable[c][r].type, liveField[c][r].type, `durable field diverged at ${c},${r}`);
    }
  }
});

// ---------------------------------------------------------------- irreversible loss

test('irreversible loss: hollowing a contact permanently costs the contact and its yield', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h);
  const { siteId, extractorId } = buildAnchoredSite(h);

  const before = machineView(h, siteId, extractorId);
  const solidBefore = before.geo.solid;
  const silicateBefore = silicateOf(before);
  assert.ok(solidBefore > 0 && silicateBefore > 0, 'fixture must start with live geology');

  // Expected loss from independent PINNED rates (not production CONTACT_YIELD export).
  const victim = before.geo.cells.find((cell) => cell.kind === 'matrix' || cell.kind === 'basalt');
  assert.ok(victim, 'extractor needs at least one matrix/basalt contact to lose');
  const expectedLoss = victim.kind === 'matrix' ? PINNED_MATRIX_PER_MIN : PINNED_BASALT_PER_MIN;

  hollowCell(h, victim.col, victim.row);

  const after = machineView(h, siteId, extractorId);
  assert.equal(after.geo.solid, solidBefore - 1, 'exactly one contact destroyed');
  assert.equal(after.geo.empty, before.geo.empty + 1, 'it became access, not nothing');
  assert.equal(after.geo.solid + after.geo.empty, 8, 'the ring is still exactly 8');

  const delta = silicateBefore - silicateOf(after);
  // At-bound: loss equals the pinned per-contact rate within tolerance.
  assert.ok(
    Math.abs(delta - expectedLoss) <= YIELD_EQ_TOL,
    `at-bound: silicate must fall by exactly one ${victim.kind} contact (${expectedLoss}): ${silicateBefore} -> ${silicateOf(after)}`,
  );
  // Beyond-bound: a drifted rate expectation must not pass the same check.
  assert.ok(
    Math.abs(delta - (expectedLoss + YIELD_BEYOND_DRIFT)) > YIELD_EQ_TOL,
    'beyond-bound: a +0.01 rate drift must fail the exact-loss check',
  );
  // Purely monotone law variant (independent of exact rate literals).
  assert.ok(silicateOf(after) < silicateBefore, 'monotone: yield falls when a contact is lost');
  assert.ok(after.geo.solid < solidBefore, 'monotone: solid contacts fall when a cell is hollowed');

  // ...and it never comes back. Long sim time, many ticks, repeated reads.
  const lostSolid = after.geo.solid;
  const lostSilicate = silicateOf(after);
  for (let i = 0; i < 600; i++) {
    h.state.simTime += 10;
    h.state.tick += 1;
    h.sys.update(10, h.state);
  }
  const later = machineView(h, siteId, extractorId);
  assert.equal(later.geo.solid, lostSolid, 'contact must not regrow over sim time');
  assert.equal(silicateOf(later), lostSilicate, 'yield potential must not regrow over sim time');
  assert.ok(h.sys.getSite(siteId).cleared.includes(tileIndex(victim.col, victim.row)),
    'the hollow cell stays in the durable record');
});

test('cleared is append-only: nothing in the site system ever re-solidifies a cell', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h);
  const { site, siteId, extractorId } = buildAnchoredSite(h);

  const seen = new Set(site.cleared);
  let solid = machineView(h, siteId, extractorId).geo.solid;
  for (const cell of machineView(h, siteId, extractorId).geo.cells) {
    if (cell.kind === 'empty') continue;
    hollowCell(h, cell.col, cell.row);
    // Monotone: the previous set is always a subset of the new one.
    for (const idx of seen) assert.ok(site.cleared.includes(idx), `cleared lost index ${idx}`);
    for (const idx of site.cleared) seen.add(idx);
    const next = machineView(h, siteId, extractorId).geo.solid;
    assert.equal(next, solid - 1, 'each break costs exactly one contact');
    solid = next;
  }
  // Ring fully hollowed: the machine is now a dead box in a void, permanently.
  const dead = machineView(h, siteId, extractorId);
  assert.equal(dead.geo.solid, 0);
  assert.equal(dead.geo.empty, 8);
  assert.equal(dead.capability.geologyLive, false);
  assert.deepEqual(dead.capability.outputsPerMin, {}, 'no contacts, no output — nothing compensates');
});

// ---------------------------------------------------------------- THE GUARD (drill.js:441)

test('THE GUARD: a site rock is exempt from geometry recovery, so tunnels never heal shut', () => {
  const h = makeHarness({ withDrill: true });
  const ent = addAsteroid(h);
  openSession(h);
  const { siteId, extractorId } = buildAnchoredSite(h);
  assert.equal(ent.data.siteId, siteId, 'the site stamp is what the guard tests');

  const clearedBefore = ent.data.drillCleared.slice().sort((a, b) => a - b);
  const solidBefore = machineView(h, siteId, extractorId).geo.solid;
  const silicateBefore = silicateOf(machineView(h, siteId, extractorId));
  assert.ok(clearedBefore.length > 1, 'need more than the entry shaft for the control to be meaningful');

  // POSITIVE CONTROL — proves the test is not vacuous. Unguarded, this much time away collapses
  // the whole bore back to the single entry shaft cell.
  const unguarded = recoverClearedGeometry(clearedBefore, 100000);
  assert.deepEqual(unguarded, [entryShaftIndex()],
    'control: recoverClearedGeometry DOES collapse this list at 100000s away');
  assert.ok(unguarded.length < clearedBefore.length,
    `control: ${clearedBefore.length} cells would have shrunk to ${unguarded.length}`);

  // Now walk the same list through the real drill entry point after the same time away.
  h.state.drill = null;
  ent.data.lastDrillT = 0;
  h.state.simTime = 100000;
  assert.equal(h.drillSys.begin(ROCK_ID), true);

  const clearedAfter = ent.data.drillCleared.slice().sort((a, b) => a - b);
  for (const idx of clearedBefore) {
    assert.ok(clearedAfter.includes(idx), `guard failed: cleared cell ${idx} healed shut around a machine`);
  }
  assert.ok(clearedAfter.length >= clearedBefore.length, 'the bore may only grow across a re-entry');

  // And the live field the player re-enters still shows the same hollow chamber.
  for (const [c, r] of POCKET) {
    assert.equal(h.state.drill.field[c][r].type, 'empty', `re-entered field re-solidified ${c},${r}`);
  }
  const reopened = machineView(h, siteId, extractorId);
  assert.equal(reopened.geo.solid, solidBefore, 'contact unchanged across a session re-entry');
  assert.equal(silicateOf(reopened), silicateBefore, 'yield unchanged across a session re-entry');
});

test('drill:end resync cannot shrink the hollow set (persist-before-emit + union merge)', () => {
  const h = makeHarness({ withDrill: true });
  const ent = addAsteroid(h);
  openSession(h);
  const { site, siteId, extractorId } = buildAnchoredSite(h);

  const victim = machineView(h, siteId, extractorId).geo.cells
    .find((cell) => cell.kind === 'matrix' || cell.kind === 'basalt');
  hollowCell(h, victim.col, victim.row);
  const clearedBefore = site.cleared.slice();
  const solidBefore = machineView(h, siteId, extractorId).geo.solid;
  const silicateBefore = silicateOf(machineView(h, siteId, extractorId));

  // A full retract/re-enter/retract cycle through the real drill system. asteroidSites replaces
  // site.cleared WHOLESALE on drill:end; that is only safe because drill.js persists a UNION of the
  // prior list with a live field scan BEFORE it emits the event.
  h.state.drill = null;
  h.state.simTime += 5000;
  ent.data.lastDrillT = h.state.simTime;
  h.drillSys.begin(ROCK_ID);
  h.state.simTime += 30;
  const result = h.drillSys.end({ reason: 'retracted' });
  assert.equal(result.asteroidId, ROCK_ID);

  for (const idx of clearedBefore) {
    assert.ok(site.cleared.includes(idx), `drill:end resync dropped cleared cell ${idx}`);
  }
  assert.ok(site.cleared.length >= clearedBefore.length, 'cleared is monotone across a session');
  const after = machineView(h, siteId, extractorId);
  assert.equal(after.geo.solid, solidBefore, 'the lost contact stays lost — and no extra contact is lost');
  assert.equal(silicateOf(after), silicateBefore);
});

// ---------------------------------------------------------------- persistence

test('save/reload preserves the hollow set and the reduced contact exactly', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h);
  const { site, siteId, extractorId } = buildAnchoredSite(h);

  const victim = machineView(h, siteId, extractorId).geo.cells
    .find((cell) => cell.kind === 'matrix' || cell.kind === 'basalt');
  hollowCell(h, victim.col, victim.row);

  const view = machineView(h, siteId, extractorId);
  const clearedBefore = site.cleared.slice();
  const geoBefore = { solid: view.geo.solid, empty: view.geo.empty, matrix: view.geo.matrix, basalt: view.geo.basalt };
  const outputsBefore = { ...view.capability.outputsPerMin };

  const blob = JSON.parse(JSON.stringify(h.sys.serialize()));
  h.state.drill = null;
  h.sys.deserialize(blob);

  const restored = h.sys.getSite(siteId);
  assert.ok(restored, 'anchored site survives the roundtrip');
  // The SET is the contract; _normalize sorts it on load, so compare as sets.
  assert.deepEqual(sorted(restored.cleared), sorted(clearedBefore), 'the hollow set is durable');
  assert.equal(restored.boreSeed, ROCK_ID, 'the frozen bore seed is durable');

  const after = machineView(h, siteId, extractorId);
  assert.deepEqual(
    { solid: after.geo.solid, empty: after.geo.empty, matrix: after.geo.matrix, basalt: after.geo.basalt },
    geoBefore,
    'contact is recomputed identically from the restored bore + cleared list',
  );
  assert.deepEqual(after.capability.outputsPerMin, outputsBefore, 'the lost yield does not come back on load');
});

test('re-materialization closes the loop: hollow -> save -> load -> rock gone -> rock back -> still lost', () => {
  const h = makeHarness({ withDrill: true });
  addAsteroid(h);
  openSession(h);
  const { site, siteId, extractorId } = buildAnchoredSite(h);

  const victim = machineView(h, siteId, extractorId).geo.cells
    .find((cell) => cell.kind === 'matrix' || cell.kind === 'basalt');
  hollowCell(h, victim.col, victim.row);
  const clearedBefore = site.cleared.slice();
  const view = machineView(h, siteId, extractorId);
  const solidBefore = view.geo.solid;
  const silicateBefore = silicateOf(view);

  // Save, drop the world, load.
  const blob = JSON.parse(JSON.stringify(h.sys.serialize()));
  h.state.drill = null;
  h.entities.delete(ROCK_ID);
  h.sys.deserialize(blob);

  // Sector visit → the repair sweep re-spawns the rock from the anchor recipe.
  h.state.simTime += 1;
  h.sys.update(1, h.state);
  const rock = [...h.entities.values()].find((e) => e.type === 'asteroid' && e.data && e.data.siteId === siteId);
  assert.ok(rock, 'anchored site re-materialized its rock');
  assert.notEqual(rock.id, ROCK_ID, 'a genuinely new entity id');
  assert.equal(rock.data.boreSeed, ROCK_ID, 'frozen bore travels with the rock');
  assert.deepEqual(sorted(rock.data.drillCleared), sorted(clearedBefore), 'the hollow set travels with the rock');
  assert.equal(h.sys.getSite(siteId).asteroidId, rock.id);

  // Re-drill the respawned rock and retract: contact is still exactly what the player destroyed.
  h.state.simTime += 5000;
  rock.data.lastDrillT = 0; // maximum time away — the guard is the only thing protecting the bore
  assert.equal(h.drillSys.begin(rock.id), true);
  h.state.simTime += 10;
  h.drillSys.end({ reason: 'retracted' });

  for (const idx of clearedBefore) {
    assert.ok(h.sys.getSite(siteId).cleared.includes(idx), `cell ${idx} lost across the full loop`);
  }
  const after = machineView(h, siteId, extractorId);
  assert.equal(after.geo.solid, solidBefore, 'contact identical after the full save/respawn/re-drill loop');
  assert.equal(silicateOf(after), silicateBefore);
});

// ---------------------------------------------------------------- dismantling (contact permanence only)

test('dismantling a machine never restores neighbour contact', () => {
  // Contact-ring law only: removal must not re-solidify geology.
  // Control-unit refund is a different materials/cargo law — not asserted here (P1-4).
  const h = makeHarness();
  addAsteroid(h);
  openSession(h);
  const { siteId, extractorId } = buildAnchoredSite(h);
  // Anchored → remote install; 13,1 is hollow and inside the extractor's ring.
  const port = h.sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_cargo_port', col: 13, row: 1 });
  assert.equal(port.ok, true);

  const before = machineView(h, siteId, extractorId);

  assert.deepEqual(h.sys.removeMachine(siteId, port.machineId), { ok: true, reason: null });

  const after = machineView(h, siteId, extractorId);
  assert.equal(after.geo.solid, before.geo.solid, 'dismantling does not re-solidify anything');
  assert.equal(after.geo.empty, before.geo.empty);
  assert.equal(silicateOf(after), silicateOf(before), 'no contact, no yield, comes back with the castings');
  // The vacated cell is still hollow in the durable field — the excavation was permanent.
  assert.equal(h.sys.projection(siteId).field[13][1].type, 'empty');
});

// ---------------------------------------------------------------- end-to-end produced units

test('end-to-end: units actually landed in the lane store fall after a contact is hollowed', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h);
  const { site, siteId, extractorId } = buildAnchoredSite(h);
  // One shared spine: (14,2) bridges the extractor (13,2) and the core (14,1) on both networks,
  // so the extractor is fully powered and has somewhere to put what it digs.
  assert.equal(h.sys.setOverlay(siteId, 'power', 14, 2, true).ok, true);
  assert.equal(h.sys.setOverlay(siteId, 'lane', 14, 2, true).ok, true);
  h.sys.setExportFlag(siteId, 'cmdty_silicate', false); // hold the output so nothing ships out
  h.sys.setPodTarget(siteId, 0);

  const runTicks = (n) => {
    for (let i = 0; i < n; i++) {
      h.state.simTime += SITE_BALANCE.tickS;
      h.state.tick += 1;
      h.sys.update(SITE_BALANCE.tickS, h.state);
    }
  };
  const silicateInStores = () => site.laneStores
    .reduce((sum, ls) => sum + (Number(ls.store.cmdty_silicate) || 0), 0);

  const t0 = silicateInStores();
  runTicks(240);
  const producedFull = silicateInStores() - t0;
  assert.ok(producedFull > 0, `powered extractor must actually deposit silicate, got ${producedFull}`);
  assert.equal(machineView(h, siteId, extractorId).status.state, 'running');

  // Destroy one contact face and run the identical window again.
  const victim = machineView(h, siteId, extractorId).geo.cells
    .find((cell) => cell.kind === 'matrix' || cell.kind === 'basalt');
  hollowCell(h, victim.col, victim.row);

  const t1 = silicateInStores();
  runTicks(240);
  const producedReduced = silicateInStores() - t1;
  assert.ok(
    producedReduced < producedFull,
    `real deposited output must fall after losing a contact: ${producedFull} -> ${producedReduced}`,
  );
  assert.ok(producedReduced > 0, 'the surviving contacts still pay — the loss is proportional, not a cliff');
});
