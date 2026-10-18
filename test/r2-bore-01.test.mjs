// BORE-01 — harmonic stress. Adjacent heavy machines with no rock pillar between them
// fracture the ceiling on the site tick. The same bay with a pillar does not.
// The fracture is a ceiling slab that falls into the bore, announced by the
// existing rock-groan cue. No roll, no stat penalty.
import test from 'node:test';
import assert from 'node:assert/strict';

import { tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const { COLS, ROWS } = DRILL_CONST;
const SEED = 4242;
const RUMBLE_S = 8;
const FRACTURE_S = 12;
const GROAN = 'Refinery beside Refinery — the ceiling is groaning.';
const FELL = 'A ceiling slab fell and blocked the bore.';
const RUMBLE_CUE = 'presentation.mining.fracture_warning';
const BREAK_CUE = 'presentation.mining.fracture_break';

const ROCK = () => ({
  type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 1.2, risk: 'low',
});
const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });

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

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0,
    tick: 0,
    timeScale: 1,
    meta: { seed: SEED },
    entities,
    playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 40,
          cmdty_control_unit: 8,
          cmdty_refined_metals: 12,
          cmdty_electronics: 8,
        },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const registry = { get() { return null; } };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities };
}

function addAsteroid(h) {
  const ent = {
    id: SEED, type: 'asteroid', alive: true, pos: { x: 80, z: -20 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_bore' },
  };
  h.entities.set(SEED, ent);
  return ent;
}

function carve(h, cells) {
  const field = [];
  for (let c = 0; c < COLS; c++) {
    field[c] = [];
    for (let r = 0; r < ROWS; r++) field[c][r] = ROCK();
  }
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(SEED);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  const [ac, ar] = cells[0];
  h.state.drill = { active: true, asteroidId: SEED, field, avatar: { col: ac, row: ar } };
  return field;
}

function install(h, defId, col, row) {
  const res = h.sys.installMachine({ asteroidId: SEED, defId, col, row });
  assert.equal(res.ok, true, `${defId} at ${col},${row} should install (${res.reason})`);
  return res;
}

function cueCount(bus, id) {
  return bus.events.filter((e) => e.name === 'audio:cue' && e.payload && e.payload.id === id).length;
}

function tick(h) {
  h.state.simTime += 1;
  h.state.tick += 1;
  h.sys.update(1, h.state);
}

function refineryPower(h, site) {
  const rt = h.sys._runtime(site);
  for (const m of site.machines) {
    if (m.defId !== 'sm_refinery' && m.defId !== 'sm_extractor') continue;
    const key = rt.powerCompByMachine[m.id];
    const ratio = key != null ? rt.compRatio[key] : 0;
    assert.ok(ratio > 0, `${m.defId} at ${m.col},${m.row} is running`);
  }
}

function assertPlain(text) {
  assert.equal(typeof text, 'string');
  assert.doesNotMatch(text, /sm_|cmdty_|site_|m\d/);
  assert.doesNotMatch(text, /[a-z][A-Z]/);
}

// Open bay: two refineries share a row, nothing solid between them.
// Headroom above them is the bore. The ceiling is the rock on the row above that.
const OPEN_CELLS = [
  [13, 6], [14, 6], [15, 6], [16, 6],
  [13, 5], [14, 5], [15, 5], [16, 5],
];

function buildOpen(h, heavyId) {
  addAsteroid(h);
  carve(h, OPEN_CELLS);
  install(h, heavyId, 14, 6);
  install(h, heavyId, 15, 6);
  install(h, 'sm_massline_core', 16, 6);
  // The seeded geology is irrelevant: this is the fixed bay the schedule is about.
  h.state.drill.field[14][4] = ROCK();
  h.state.drill.field[15][4] = ROCK();
  return h.sys.getSite(h.state.entities.get(SEED).data.siteId);
}

// Same machines, one solid column between the rooms, power routed around it.
const PILLAR_CELLS = [
  [12, 6], [13, 6], [15, 6], [16, 6],
  [12, 5], [13, 5], [15, 5], [16, 5],
  // Row 7 walks around the pillar column so both rooms stay powered and reachable.
  [12, 7], [13, 7], [14, 7], [15, 7], [16, 7],
];

function buildPillar(h) {
  addAsteroid(h);
  carve(h, PILLAR_CELLS);
  h.state.drill.field[14][5] = ROCK();
  h.state.drill.field[14][6] = ROCK();
  install(h, 'sm_refinery', 13, 6);
  install(h, 'sm_refinery', 15, 6);
  install(h, 'sm_massline_core', 16, 6);
  const site = h.sys.getSite(h.state.entities.get(SEED).data.siteId);
  for (const col of [13, 14, 15, 16]) {
    const painted = h.sys.setOverlay(site.id, 'power', col, 7, true);
    assert.equal(painted.ok, true, `power cable at ${col},7 (${painted.reason})`);
  }
  h.state.drill.field[14][4] = ROCK();
  h.state.drill.field[14][5] = ROCK();
  h.state.drill.field[14][6] = ROCK();
  return site;
}

test('adjacent refineries with no pillar drop a ceiling slab on the sim schedule', () => {
  const h = makeHarness();
  const site = buildOpen(h, 'sm_refinery');
  const field = h.state.drill.field;
  const cargoBefore = { ...h.state.player.cargo.items };
  const machineIds = site.machines.map((m) => m.id).join(',');

  assert.equal(field[14][5].type, 'empty');
  assert.equal(field[14][4].type, 'rock');
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 0);

  for (let s = 1; s <= RUMBLE_S - 1; s++) tick(h);
  refineryPower(h, site);
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 0, 'the bay does not groan before the rumble mark');
  assert.equal(field[14][5].type, 'empty', 'the bore stays open before the rumble');

  tick(h); // second 8
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 1);
  assert.equal(cueCount(h.bus, BREAK_CUE), 0);
  assert.ok(site.ledger.some((row) => row.text === GROAN), 'the groan is written in plain words');
  assert.equal(field[14][5].type, 'empty', 'the groan comes before the slab falls');
  for (const row of site.ledger) if (row.text === GROAN) assertPlain(row.text);

  for (let s = RUMBLE_S + 1; s <= FRACTURE_S - 1; s++) tick(h);
  assert.equal(field[14][5].type, 'empty', 'the slab waits for the fracture mark');
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 1, 'the rumble is once');

  tick(h); // second 12
  const landed = field[14][5];
  const opened = field[14][4];
  assert.equal(opened.type, 'empty', 'the ceiling tile is gone — it fell');
  assert.equal(landed.type, 'rock');
  assert.equal(landed.fallen, true, 'the rock in the bore is the fallen slab');
  assert.equal(landed.hp, 8, 'the slab keeps the ceiling rock it used to be');
  assert.notEqual(landed.type, 'empty');
  assert.ok(!(landed.type === 'empty' && !landed.structure), 'the rover cannot walk the blocked bore');
  assert.equal(cueCount(h.bus, BREAK_CUE), 1);
  assert.ok(site.ledger.some((row) => row.text === FELL));
  for (const row of site.ledger) if (row.text === FELL) assertPlain(row.text);
  assert.ok(h.bus.events.some((e) => e.name === 'presentation:caption' && e.payload && e.payload.text === GROAN));

  const falls = site.structure && site.structure.falls;
  assert.ok(Array.isArray(falls) && falls.length === 1);
  assert.deepEqual(
    { col: falls[0].col, row: falls[0].row, fromCol: falls[0].fromCol, fromRow: falls[0].fromRow },
    { col: 14, row: 5, fromCol: 14, fromRow: 4 },
  );

  tick(h);
  tick(h);
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 1);
  assert.equal(cueCount(h.bus, BREAK_CUE), 1);
  assert.equal(site.structure.falls.length, 1, 'one slab, not a continuing collapse');
  assert.equal(site.machines.map((m) => m.id).join(','), machineIds, 'no machine was removed or retuned');
  assert.deepEqual(h.state.player.cargo.items, cargoBefore, 'the fall does not touch the hold');
  assert.equal(h.bus.events.some((e) => e.name === 'economy:grantCredits'), false);
});

test('the same bay with a rock pillar between the refineries never fractures', () => {
  const h = makeHarness();
  const site = buildPillar(h);
  const field = h.state.drill.field;
  const before = {
    bore: field[13][5].type,
    pillar: field[14][6].type,
    ceiling: field[14][4].type,
  };

  for (let s = 1; s <= FRACTURE_S + 2; s++) tick(h);
  refineryPower(h, site);

  assert.equal(field[13][5].type, before.bore);
  assert.equal(field[14][6].type, 'rock', 'the pillar is still rock');
  assert.equal(field[14][4].type, before.ceiling);
  assert.equal(field[13][5].fallen, undefined);
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 0);
  assert.equal(cueCount(h.bus, BREAK_CUE), 0);
  assert.equal(site.ledger.some((row) => row.text === GROAN || row.text === FELL), false);
  assert.ok(!site.structure || !site.structure.fractured);
  assert.ok(!site.structure || !(site.structure.stressS > 0));
});

test('extractors side by side are not heavy enough to fracture the bay', () => {
  const h = makeHarness();
  const site = buildOpen(h, 'sm_extractor');
  const field = h.state.drill.field;
  for (let s = 1; s <= FRACTURE_S + 2; s++) tick(h);
  refineryPower(h, site);
  assert.equal(field[14][5].type, 'empty');
  assert.equal(field[14][4].type, 'rock');
  assert.equal(field[14][4].fallen, undefined);
  assert.equal(cueCount(h.bus, RUMBLE_CUE), 0);
  assert.equal(cueCount(h.bus, BREAK_CUE), 0);
});

test('two identical open bays fracture the same cell on the same tick', () => {
  const run = () => {
    const h = makeHarness();
    buildOpen(h, 'sm_refinery');
    let groanAt = -1;
    let fellAt = -1;
    for (let s = 1; s <= FRACTURE_S; s++) {
      tick(h);
      if (groanAt < 0 && cueCount(h.bus, RUMBLE_CUE) === 1) groanAt = s;
      if (fellAt < 0 && h.state.drill.field[14][5].fallen === true) fellAt = s;
    }
    const fall = h.sys.getSite(h.state.entities.get(SEED).data.siteId).structure.falls[0];
    return `${groanAt}:${fellAt}:${fall.col},${fall.row}:${fall.fromCol},${fall.fromRow}`;
  };
  assert.equal(run(), run());
  assert.equal(run(), `${RUMBLE_S}:${FRACTURE_S}:14,5:14,4`);
});

test('a fallen ceiling slab and the stress record survive a save and reload, and no second slab drops', () => {
  const h = makeHarness();
  const site = buildOpen(h, 'sm_refinery');
  for (let s = 1; s <= FRACTURE_S; s++) tick(h);
  assert.equal(h.state.drill.field[14][5].fallen, true);
  const saved = JSON.parse(JSON.stringify(h.sys.serialize()));
  const ent = h.entities.get(SEED);
  const h2 = makeHarness();
  h2.entities.set(SEED, JSON.parse(JSON.stringify(ent)));
  h2.sys.deserialize(saved);
  const site2 = h2.sys.getSite(site.id);
  assert.ok(site2, 'site reloaded');
  assert.ok(site2.structure, 'structure record reloaded');
  assert.equal(site2.structure.fractured, true);
  assert.equal((site2.structure.falls || []).length, 1);
  const fallsBefore = site2.structure.falls.length;
  for (let s = 0; s < 10; s++) tick(h2);
  assert.equal((h2.sys.getSite(site.id).structure.falls || []).length, fallsBefore, 'no second slab after reload');
  assert.equal(cueCount(h2.bus, BREAK_CUE), 0, 'no second break cue after reload');
});
