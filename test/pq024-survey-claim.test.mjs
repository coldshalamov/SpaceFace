// PQ-024 — corridor-minimal Asteroid Ops survey and claim consequence. Focused deterministic
// coverage: pure formation selection/reveal, volatile pre-Core assay, atomic Core adoption,
// stale/duplicate/partial claim refusal, the real-positive-output receipt (committed ->
// producing), exactly-one exterior relay, save/Continue identity, and one-voice UI copy.
// No DOM, no wall clock, seeded state only (test/AGENTS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  generateDrillField, applyClearedTiles, tileIndex, DRILL_CONST, drill,
} from '../src/systems/drill.js';
import {
  SURVEY_LIMITS, selectSurveyTarget, surveyRevealFrontier, validateSurveyTarget,
  normalizeSurveyRecord, normalizeProductionReceipt,
} from '../src/systems/siteSurvey.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_MACHINE_BY_ID } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { formationLabel, surveySentences, placementReason } from '../src/ui/asteroid/inspector.js';

const { COLS, ROWS } = DRILL_CONST;
const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const DIRT = () => ({ type: 'dirt', hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7 });
const ROCK = () => ({ type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 1.2 });
const VEIN = (ore) => ({ type: 'vein', hp: 5, maxHp: 5, ore, yieldU: 2, hazard: false, tierReq: 1, hardness: 1 });
const GAS = () => ({ type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 });

function makeField(kind) {
  const field = [];
  for (let c = 0; c < COLS; c++) {
    field[c] = [];
    for (let r = 0; r < ROWS; r++) {
      field[c][r] = kind === 'empty' ? EMPTY() : kind === 'rock' ? ROCK() : DIRT();
    }
  }
  return field;
}

function put(field, cells, tile) {
  for (const [c, r] of cells) field[c][r] = { ...tile };
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

function makeHarness({ spawnNull = false } = {}) {
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
      if (spawnNull) return null; // missing-asset/projector-failure fixture
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      spawned.push(ent);
      return ent;
    },
  };
  const registry = { get: () => null };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities, helpers, spawned };
}

function addAsteroid(h, id = 42) {
  const ent = {
    id, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

/** Wire the REAL drill system so the survey verb (pulseScan -> drill:scanPulse) drives the seam. */
function wireDrill(h) {
  h.drillSys = Object.create(drill);
  h.drillSys.init({ state: h.state, bus: h.bus });
}

function openSession(h, asteroidId, cells) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(asteroidId);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

/** Force an effective survey pulse past the cooldown (the verb's own gate stays authoritative). */
function pulse(h) {
  const d = h.state.drill;
  if (!d.scan) d.scan = { cooldown: 0, active: 0, serial: 0, contacts: 0 };
  d.scan.cooldown = 0;
  return h.drillSys.pulseScan();
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }
}

// ------------------------------------------------------------------ pure math

test('selector: deterministic on real fields, reads a discrete interior vein feature', () => {
  const a = selectSurveyTarget(generateDrillField(42), COLS, ROWS);
  const b = selectSurveyTarget(generateDrillField(42), COLS, ROWS);
  assert.deepEqual(a, b);
  assert.ok(a.targetId.startsWith('frm_'));
  assert.ok(a.material.startsWith('vein:'), `expected a vein feature, got ${a.material}`);
  assert.ok(a.cells.length >= SURVEY_LIMITS.minArea && a.cells.length <= SURVEY_LIMITS.maxArea);
  for (const seed of [47, 1, 7, 99]) {
    const t = selectSurveyTarget(generateDrillField(seed), COLS, ROWS);
    assert.ok(t, `seed ${seed} yields a target`);
    assert.ok(t.cells.length >= SURVEY_LIMITS.minArea);
  }
});

test('selector: class rank, size, then stable cell key; band filter and fallback ladder', () => {
  // Bigger vein cluster beats smaller (the basalt sea around them is out of band).
  let field = makeField('rock');
  put(field, [[5, 10], [6, 10], [5, 11]], VEIN('cmdty_ore_iron'));
  put(field, [[20, 30], [21, 30], [20, 31], [21, 31]], VEIN('cmdty_ore_copper'));
  let t = selectSurveyTarget(field, COLS, ROWS);
  assert.equal(t.material, 'vein:cmdty_ore_copper');
  assert.equal(t.cells.length, 4);
  // Equal sizes: the stable cell key (lowest index) wins.
  field = makeField('rock');
  put(field, [[20, 30], [21, 30], [20, 31]], VEIN('cmdty_ore_iron'));
  put(field, [[5, 10], [6, 10], [5, 11]], VEIN('cmdty_ore_copper'));
  t = selectSurveyTarget(field, COLS, ROWS);
  assert.equal(t.material, 'vein:cmdty_ore_copper');
  assert.equal(t.cells[0], tileIndex(5, 10));
  // Gas beats the matrix sea (the sea is excluded by maxArea).
  field = makeField('dirt');
  put(field, [[8, 20], [9, 20], [8, 21], [9, 21]], GAS());
  t = selectSurveyTarget(field, COLS, ROWS);
  assert.equal(t.material, 'gas');
  // Nothing in band: the declared fallback ladder still returns ONE target (totality).
  field = makeField('dirt');
  put(field, [[8, 20], [9, 20]], GAS()); // size 2 < minArea; the dirt sea > maxArea
  t = selectSurveyTarget(field, COLS, ROWS);
  assert.ok(t, 'selector is total when only out-of-band components exist');

test('reveal frontier: seeds the stable key, spreads ascending, bounded, terminates', () => {
  const cells = [tileIndex(16, 10), tileIndex(17, 10), tileIndex(16, 11), tileIndex(17, 11)].sort((a, b) => a - b);
  let revealed = [];
  let next = surveyRevealFrontier(cells, revealed, 2, COLS);
  assert.deepEqual(next, [cells[0], cells[1]]);
  revealed = revealed.concat(next);
  next = surveyRevealFrontier(cells, revealed, 2, COLS);
  assert.deepEqual(next, [cells[2], cells[3]]);
  revealed = revealed.concat(next);
  assert.deepEqual(surveyRevealFrontier(cells, revealed, 2, COLS), []);
  // Budget 1 walks the same deterministic order one cell at a time.
  revealed = [];
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const step = surveyRevealFrontier(cells, revealed, 1, COLS);
    if (!step.length) break;
    seq.push(...step);
    revealed = revealed.concat(step);
  }
  assert.deepEqual(seq, cells);
});

test('validateSurveyTarget: exact identity — drilled cells, material drift, subsets are stale', () => {
  const cells = [tileIndex(10, 20), tileIndex(11, 20), tileIndex(10, 21)].sort((a, b) => a - b);
  const record = { material: 'vein:cmdty_ore_iron', cells };
  const field = makeField('dirt');
  put(field, [[10, 20], [11, 20], [10, 21]], VEIN('cmdty_ore_iron'));
  assert.equal(validateSurveyTarget(record, field, COLS, ROWS), true);
  const drilled = makeField('dirt');
  put(drilled, [[10, 20], [11, 20], [10, 21]], VEIN('cmdty_ore_iron'));
  drilled[11][20] = EMPTY();
  assert.equal(validateSurveyTarget(record, drilled, COLS, ROWS), false);
  const drifted = makeField('dirt');
  put(drifted, [[10, 20], [11, 20], [10, 21]], VEIN('cmdty_ore_copper'));
  assert.equal(validateSurveyTarget(record, drifted, COLS, ROWS), false);
  assert.equal(validateSurveyTarget({ material: record.material, cells: cells.slice(0, 2) }, field, COLS, ROWS), false);
  assert.equal(validateSurveyTarget({ material: record.material, cells: [COLS * ROWS + 5] }, field, COLS, ROWS), false);
});

test('normalizeSurveyRecord: hardens saves — demotes unprovable producing, drops malformed', () => {
  const receipt = {
    receiptId: 'prod_site_1_5_m1', siteId: 'site_1', producerId: 'm1', defId: 'sm_extractor',
    recipeId: null, outputId: 'cmdty_silicate', positiveQuantity: 1, committedTick: 5,
    sourceMutationId: 'tick:5:m1:cmdty_silicate',
  };
  const good = {
    version: 1, targetId: 'frm_x', material: 'gas', cells: [100, 101], revealedCells: [100],
    seed: 42, committedTick: 5, committedT: 12, lifecycle: 'producing', receipt,
  };
  const norm = normalizeSurveyRecord(good, COLS, ROWS);
  assert.equal(norm.lifecycle, 'producing');
  assert.equal(norm.receipt.receiptId, 'prod_site_1_5_m1');
  const demoted = normalizeSurveyRecord({ ...good, receipt: { ...receipt, positiveQuantity: 0 } }, COLS, ROWS);
  assert.equal(demoted.lifecycle, 'committed', 'unprovable producing demotes to committed');
  assert.equal(demoted.receipt, null);
  assert.equal(normalizeSurveyRecord({ ...good, cells: [] }, COLS, ROWS), null);
  assert.equal(normalizeSurveyRecord({ ...good, cells: [COLS * ROWS + 1] }, COLS, ROWS), null);
  assert.equal(normalizeSurveyRecord({ ...good, targetId: '' }, COLS, ROWS), null);
  assert.equal(normalizeSurveyRecord('junk', COLS, ROWS), null);
  const clamped = normalizeSurveyRecord({ ...good, lifecycle: 'committed', receipt: null, cells: [100, COLS * ROWS + 1, 101] }, COLS, ROWS);
  assert.deepEqual(clamped.cells, [100, 101], 'out-of-range cells are dropped, valid truth kept');

// ------------------------------------------------------------------ volatile assay (cold)

test('volatile assay: pulses found and advance it; blocked pulses never advance', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const expected = selectSurveyTarget(h.state.drill.field, COLS, ROWS);
  assert.equal(pulse(h), true);
  let status = h.sys.surveyStatusFor(42);
  assert.equal(status.state, 'cold');
  assert.equal(status.volatile, true);
  assert.equal(status.targetId, expected.targetId);
  assert.equal(status.cells, expected.cells.length);
  assert.equal(status.revealed, Math.min(SURVEY_LIMITS.revealBudget, expected.cells.length));
  assert.equal(h.bus.events.filter((e) => e.name === 'site:surveyDetected').length, 1);
  // Membership read: revealed seed cell vs a foreign cell.
  const sv = h.sys._surveyByAsteroid.get(42);
  const role = h.sys.surveyCellRole(42, sv.cells[0]);
  assert.equal(role.material, sv.material);
  assert.equal(role.volatile, true);
  assert.equal(role.revealed, true);
  assert.equal(h.sys.surveyCellRole(42, tileIndex(0, 0)), null);
  // The real verb's cooldown gate refuses: no event, no advance.
  assert.equal(h.drillSys.pulseScan(), false);
  assert.equal(h.sys.surveyStatusFor(42).revealed, status.revealed);
  // Effective pulses advance deterministically to completion.
  let guard = 0;
  while (h.sys.surveyStatusFor(42).revealed < status.cells && guard++ < 12) assert.equal(pulse(h), true);
  status = h.sys.surveyStatusFor(42);
  assert.equal(status.revealed, status.cells);
  assert.equal(h.bus.events.filter((e) => e.name === 'site:surveyComplete').length, 1);
  pulse(h); // a pulse after completion stays vanilla
  assert.equal(h.bus.events.filter((e) => e.name === 'site:surveyComplete').length, 1);
  // The durable side is untouched: nothing committed, nothing serialized.
  assert.ok(!JSON.stringify(h.sys.serialize()).includes('frm_'));
});

test('Core commitment adopts the exact assayed target/reveal atomically (cold -> committed)', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  pulse(h);
  pulse(h);
  const sv = h.sys._surveyByAsteroid.get(42);
  const wantCells = sv.cells.slice();
  const wantRevealed = sv.revealed.slice();
  const cargoBefore = { ...h.state.player.cargo.items };
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res.ok, true);
  const site = h.sys.getSite(res.siteId);
  assert.equal(site.anchored, true);
  assert.ok(site.survey, 'durable survey record committed with the Core');
  assert.equal(site.survey.targetId, sv.targetId);
  assert.equal(site.survey.material, sv.material);
  assert.deepEqual(site.survey.cells, wantCells, 'exact target cells adopted — no reroll');
  assert.deepEqual(site.survey.revealedCells, wantRevealed, 'exact reveal set adopted');
  assert.equal(site.survey.seed, 42);
  assert.equal(site.survey.lifecycle, 'committed');
  assert.equal(site.survey.receipt, null);
  // The volatile copy is gone; the status read now serves the durable record.
  assert.equal(h.sys._surveyByAsteroid.size, 0);
  const status = h.sys.surveyStatusFor(42);
  assert.equal(status.state, 'committed');
  assert.equal(status.volatile, false);
  assert.equal(status.revealed, wantRevealed.length);
  // One commitment receipt, and NO exterior relay yet (committed = 0).
  assert.equal(h.bus.events.filter((e) => e.name === 'site:surveyCommitted').length, 1);
  assert.ok(!h.spawned.some((e) => e.data && e.data.siteBeacon === site.id));
  // Materials were consumed exactly once (the re-validation is not a second charge).
  const cost = SITE_MACHINE_BY_ID.get('sm_massline_core').cost;
  for (const g of Object.keys(cost)) assert.equal(h.state.player.cargo.items[g], (cargoBefore[g] || 0) - cost[g]);
});

test('Core commitment without any assay derives the identical target (documented reconstruction)', () => {
  const h = makeHarness();
  addAsteroid(h);
  const field = openSession(h, 42, POCKET);
  const want = selectSurveyTarget(field, COLS, ROWS);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res.ok, true);
  const site = h.sys.getSite(res.siteId);
  assert.equal(site.survey.targetId, want.targetId);
  assert.deepEqual(site.survey.cells, want.cells);
  assert.deepEqual(site.survey.revealedCells, []);
  assert.equal(site.survey.lifecycle, 'committed');
});

test('stale assay refuses the Core visibly — no reroll, no partial commit', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  pulse(h);
  const sv = h.sys._surveyByAsteroid.get(42);
  // Drill into the assayed formation: one target cell becomes hollow.
  const victim = sv.cells[sv.cells.length - 1];
  const vc = victim % COLS;
  const vr = Math.floor(victim / COLS);
  h.state.drill.field[vc][vr] = EMPTY();
  h.bus.emit('drill:break', { col: vc, row: vr });
  const check = h.sys.canInstall({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(check.ok, false);
  assert.equal(check.reason, 'survey-stale');
  const cargoBefore = { ...h.state.player.cargo.items };
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'survey-stale');
  assert.deepEqual(h.state.player.cargo.items, cargoBefore, 'no materials consumed by the refused commit');
  assert.equal(h.sys.siteForAsteroid(42), null, 'no partial site');
  assert.ok(!h.bus.events.some((e) => e.name === 'site:surveyCommitted'));
  assert.ok(placementReason(res).includes('Survey'), 'the refusal explains itself in the placement voice');
});

test('duplicate claim: second Core refused; commitment is idempotent', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  pulse(h);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(res.ok, true);
  const site = h.sys.getSite(res.siteId);
  const committed = JSON.parse(JSON.stringify(site.survey));
  const again = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 15, row: 1 });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'unique');
  assert.equal(h.sys._commitClaimSurvey(site), false, 're-commit never rerolls');
  assert.deepEqual(site.survey, committed);
  assert.equal(h.bus.events.filter((e) => e.name === 'site:surveyCommitted').length, 1);
});

test('reload mid-survey: volatile assay never reaches the save', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  pulse(h);
  pulse(h);
  assert.ok(h.sys._surveyByAsteroid.size > 0);
  const data = h.sys.serialize();
  assert.ok(!JSON.stringify(data).includes('frm_'), 'no survey identity in the save');
  const h2 = makeHarness();
  h2.sys.deserialize(JSON.parse(JSON.stringify(data)));

// ------------------------------------------------------------------ producing (committed -> producing)

test('first real positive output advances committed -> producing: one receipt, exactly one relay', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site, extractorId } = buildCommittedSite(h);
  assert.equal(site.survey.lifecycle, 'committed');
  h.state.drill = null; // production runs on sim time
  assert.equal(h.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 0);
  let producingTick = -1;
  for (let i = 0; i < 120 && producingTick < 0; i++) {
    tick(h);
    if (site.survey.lifecycle === 'producing') producingTick = h.state.tick;
  }
  assert.ok(producingTick > 0, 'real output landed within two minutes of sim time');
  const receipt = site.survey.receipt;
  assert.ok(receipt, 'authoritative receipt recorded');
  assert.equal(receipt.siteId, site.id);
  assert.equal(receipt.producerId, extractorId);
  assert.equal(receipt.defId, 'sm_extractor');
  assert.equal(receipt.outputId, 'cmdty_silicate');
  assert.ok(receipt.positiveQuantity >= 1, 'receipt quantity is the landed whole units');
  assert.equal(receipt.committedTick, producingTick);
  assert.ok(receipt.receiptId.includes(site.id));
  assert.ok(receipt.sourceMutationId.includes(extractorId));
  // Exactly one authoritative receipt, exactly one relay with the PQ-022 accepted identity.
  assert.equal(h.bus.events.filter((e) => e.name === 'site:producing').length, 1);
  const beacons = h.spawned.filter((e) => e.data && e.data.siteBeacon === site.id);
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].data.placeId, 'place_claim_outpost_relay');
  assert.equal(beacons[0].type, 'fx');
  // Further output never re-fires: the lifecycle is monotonic, replays idempotent.
  tick(h, 60);
  assert.equal(h.bus.events.filter((e) => e.name === 'site:producing').length, 1);
  assert.equal(h.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 1);
  const extractor = site.machines.find((m) => m.id === extractorId);
  assert.equal(h.sys._emitProductionReceipt(site, extractor, { outputId: 'cmdty_silicate', qty: 1, recipeId: null }), false);
  const replay = h.sys._acceptProductionReceipt(site, receipt);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(h.bus.events.filter((e) => e.name === 'site:producing').length, 1);
});

test('receipt validation rejects forgery classes (no self-minted production)', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site, extractorId } = buildCommittedSite(h);
  h.state.drill = null;
  const extractor = site.machines.find((m) => m.id === extractorId);
  const core = site.machines.find((m) => m.defId === 'sm_massline_core');
  const base = {
    receiptId: 'prod_forged', siteId: site.id, producerId: extractorId, defId: 'sm_extractor',
    recipeId: null, outputId: 'cmdty_silicate', positiveQuantity: 1,
    committedTick: h.state.tick, sourceMutationId: null,
  };
  assert.equal(h.sys._acceptProductionReceipt(site, null).ok, false);
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, siteId: 'site_other' }).reason, 'site-mismatch');
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, positiveQuantity: 0 }).reason, 'not-positive');
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, committedTick: h.state.tick + 5 }).reason, 'receipt-stale');
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, producerId: 'm999' }).reason, 'producer-invalid');
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, producerId: core.id, defId: 'sm_massline_core' }).reason, 'producer-invalid');
  assert.equal(h.sys._acceptProductionReceipt(site, { ...base, defId: 'sm_refinery' }).reason, 'producer-invalid');
  // Emit-side guards: non-positive, the Core, and unanchored sites never mint.
  assert.equal(h.sys._emitProductionReceipt(site, extractor, { outputId: 'cmdty_silicate', qty: 0 }), false);
  assert.equal(h.sys._emitProductionReceipt(site, core, { outputId: 'cmdty_silicate', qty: 1 }), false);
  assert.equal(site.survey.lifecycle, 'committed', 'forgeries never advance the lifecycle');
  assert.ok(!h.spawned.some((e) => e.data && e.data.siteBeacon === site.id));
  assert.ok(!h.bus.events.some((e) => e.name === 'site:producing'));
});

test('legacy anchored site without a survey converges at its first real output', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site } = buildCommittedSite(h);
  delete site.survey; // simulate a pre-PQ-024 save: anchored, producing-capable, no record
  const runtimeField = generateDrillField(42);
  applyClearedTiles(runtimeField, site.cleared);
  const want = selectSurveyTarget(runtimeField, COLS, ROWS);
  h.state.drill = null;
  let guard = 0;
  while (!(site.survey && site.survey.lifecycle === 'producing') && guard++ < 120) tick(h);
  assert.ok(site.survey, 'survey reconstructed at the first real output');
  assert.equal(site.survey.lifecycle, 'producing');
  assert.equal(site.survey.targetId, want.targetId, 'reconstruction is byte-identical to the frozen field');
  assert.deepEqual(site.survey.cells, want.cells);

// ------------------------------------------------------------------ save / Continue / re-entry

test('save/Continue preserves producing truth; re-entry re-ensures exactly one relay', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site } = buildCommittedSite(h);
  h.state.drill = null;
  let guard = 0;
  while (site.survey.lifecycle !== 'producing' && guard++ < 120) tick(h);
  const before = JSON.parse(JSON.stringify(site.survey));
  const data = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(data);
  const site2 = h2.sys.getSite(site.id);
  assert.ok(site2, 'anchored site survived the save');
  assert.deepEqual(site2.survey, before, 'survey record is byte-identical after Continue');
  assert.equal(site2.survey.lifecycle, 'producing');
  assert.equal(h2.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 0);
  tick(h2); // repair sweep on the restored world: rock + exactly one relay
  assert.equal(h2.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 1);
  tick(h2); // idempotent across ticks
  assert.equal(h2.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 1);
  const rock = [...h2.entities.values()].find((e) => e.type === 'asteroid' && e.data && e.data.siteId === site.id);
  assert.ok(rock, 'anchored rock re-materialized on Continue');
  assert.equal(rock.data.boreSeed, 42);
});

test('committed (pre-output) survives Continue with zero relay; later output turns producing', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site } = buildCommittedSite(h);
  const data = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(data);
  const site2 = h2.sys.getSite(site.id);
  assert.equal(site2.survey.lifecycle, 'committed');
  tick(h2); // sweep: rock rematerializes, but committed = 0 exterior
  assert.equal(h2.spawned.filter((e) => e.data && e.data.siteBeacon === site2.id).length, 0,
    'committed projects nothing even after Continue');
  let guard = 0;
  while (site2.survey.lifecycle !== 'producing' && guard++ < 120) tick(h2);

// ------------------------------------------------------------------ partial claim / missing asset

test('partial claim: unanchored loss removes the site and every assay residue', () => {
  const h = makeHarness();
  wireDrill(h);
  addAsteroid(h);
  openSession(h, 42, POCKET);
  h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  pulse(h);
  assert.ok(h.sys._surveyByAsteroid.size > 0);
  h.entities.get(42).alive = false;
  h.state.drill = null;
  tick(h);
  assert.equal(h.sys.siteForAsteroid(42), null);
  assert.equal(h.sys._surveyByAsteroid.size, 0, 'a lost claim keeps no assay residue');
  assert.equal(h.sys.surveyStatusFor(42), null);
  assert.ok(h.bus.events.some((e) => e.name === 'site:lost'));
  assert.equal(h.sys.serialize().order.length, 0);
});

test('missing asset / spawn failure: lifecycle still records; relay recovers on re-entry', () => {
  const h = makeHarness({ spawnNull: true });
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const { site } = buildCommittedSite(h);
  h.state.drill = null;
  let guard = 0;
  while (site.survey.lifecycle !== 'producing' && guard++ < 120) tick(h);
  assert.equal(site.survey.lifecycle, 'producing', 'the lifecycle records even when the projector cannot spawn');
  assert.equal(h.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 0);
  // A later visit with a working projector re-ensures exactly one relay (no permanent loss).
  const data = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(data);
  tick(h2);
  const beacons = h2.spawned.filter((e) => e.data && e.data.siteBeacon === site.id);
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].data.placeId, 'place_claim_outpost_relay');
});

// ------------------------------------------------------------------ UI copy + wiring (one voice)

test('survey copy stays one-voice: labels, sentences, and the stale placement reason', () => {
  assert.ok(formationLabel('vein:cmdty_ore_iron').endsWith('vein cluster'));
  assert.equal(formationLabel('gas'), 'sealed gas pocket cluster');
  const cold = surveySentences({ state: 'cold', volatile: true, material: 'vein:cmdty_ore_iron', cells: 4, revealed: 2, receipt: null });
  assert.ok(cold.some((s) => s.text.includes('2/4')));
  assert.ok(cold.some((s) => s.kind === 'warn' && /volatile/i.test(s.text)), 'volatility is explicit before commitment');
  const coldEmpty = surveySentences({ state: 'cold', volatile: true, material: null, cells: 0, revealed: 0, receipt: null });
  assert.ok(coldEmpty.some((s) => /pulse the survey scanner/i.test(s.text)));
  const committed = surveySentences({ state: 'committed', material: 'gas', cells: 5, revealed: 5, receipt: null });
  assert.ok(committed.some((s) => /committed to the claim/.test(s.text)));
  assert.ok(committed.some((s) => /first real output/.test(s.text)));
  const producing = surveySentences({
    state: 'producing', material: 'gas', cells: 5, revealed: 5,
    receipt: { positiveQuantity: 2, outputId: 'cmdty_gas_hydrogen' },
  });
  assert.ok(producing.some((s) => /Producing since first real output/.test(s.text)));
  assert.ok(producing.some((s) => /relay online/.test(s.text)));
  assert.ok(placementReason({ reason: 'survey-stale' }).includes('Survey'));
});

test('the asteroid screen wires the survey surfaces (chip, subscriptions, inspector pass-through)', () => {
  const src = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');
  for (const evt of ['site:surveyDetected', 'site:surveyComplete', 'site:surveyCommitted', 'site:producing']) {
    assert.ok(src.includes(`ctx.bus.on('${evt}'`), `screen subscribes to ${evt}`);
  }
  assert.ok(src.includes('surveyStatusFor'), 'assay chip + inspector read the survey status');
  assert.ok(src.includes('surveyCellRole'), 'hover tiles read formation membership');
  assert.ok(src.includes('hudEls.assay'), 'the assay chip element exists');
});

// ------------------------------------------------------------------ determinism

test('determinism: identical runs produce identical records, receipts, and relay placement', () => {
  const run = () => {
    const h = makeHarness();
    wireDrill(h);
    addAsteroid(h);
    openSession(h, 42, POCKET);
    pulse(h);
    h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
    h.state.drill.avatar = { col: 14, row: 1 };
    const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 2 });
    h.state.drill = null;
    const site = h.sys.getSite(res.siteId);
    tick(h, 90);
    const beacon = h.spawned.find((e) => e.data && e.data.siteBeacon === site.id);
    return {
      survey: site.survey,
      beacon: beacon ? { x: beacon.pos.x, z: beacon.pos.z, rot: beacon.rot } : null,
    };
  };
  assert.deepEqual(run(), run());
});

  assert.equal(site2.survey.lifecycle, 'producing');
  assert.equal(h2.spawned.filter((e) => e.data && e.data.siteBeacon === site2.id).length, 1);
});

  assert.deepEqual(site.survey.revealedCells, []);
  assert.ok(site.survey.receipt);
  assert.equal(h.spawned.filter((e) => e.data && e.data.siteBeacon === site.id).length, 1);
});

  assert.equal(h2.sys.surveyStatusFor(42), null);
  assert.equal(h2.sys._surveyByAsteroid.size, 0);
  assert.equal(h2.state.sites.order.length, 0, 'unanchored claims are not saved either');
});


  const trimmed = normalizeSurveyRecord({ ...good, lifecycle: 'committed', receipt: null, revealedCells: [100, 555] }, COLS, ROWS);
  assert.deepEqual(trimmed.revealedCells, [100], 'reveal set is restricted to formation members');
  assert.equal(normalizeProductionReceipt(null), null);
  assert.equal(normalizeProductionReceipt({ ...receipt, defId: 'sm_massline_core' }), null, 'the Core is never a producer');
});

  assert.equal(t.material, 'matrix');
  // Fully hollow interior: genuinely nothing to assay.
  assert.equal(selectSurveyTarget(makeField('empty'), COLS, ROWS), null);
});


/** Extractor + Core on conducting cells (13,2)/(14,2) inside the pocket; returns the site. */
function buildCommittedSite(h) {
  let res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(res.ok, true);
  const extractorId = res.machineId;
  h.state.drill.avatar = { col: 14, row: 1 };
  res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 2 });
  assert.equal(res.ok, true);
  const site = h.sys.getSite(res.siteId);
  return { site, extractorId };
}

const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];
