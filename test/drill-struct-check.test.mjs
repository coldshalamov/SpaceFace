// Roof mechanics — the hall/span escalation contract (drill._structCheck).
//
// The law (drill.js roof-mechanics header): a corridor is safe; a HALL — a run of empties with
// open headroom above it — is not. First contact past the warn span CRACKS the roof and warns;
// only widening a span whose cracks already stand drops the beam as rubble. These sections pin
// the second-order edges of that law:
//
//   1. machine housing can sit in the headroom and count as a beam, but it can never crack —
//      it must be neither fresh news nor a "crack already raised", so a first-contact span
//      warns instead of dropping (the defect: housing counted as a pre-raised crack and a
//      never-warned span fell on first contact);
//   2. widening a cracked span still drops the whole beam — housing included or not — and the
//      machine itself survives the fall;
//   3. rubble lands on the LOWEST open cell of the fall column — a shaft open all the way to
//      the field's bottom still fills its last row instead of leaving the roof hanging;
//   4. the rig standing in the landing cell pays the authored hull fraction.
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { drill, DRILL_CONST } from '../src/systems/drill.js';
import { cargo } from '../src/systems/cargo.js';

const { COLS, ROWS } = DRILL_CONST;

const rock = (hp = 10) => ({ type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1, hardness: 1, risk: 'low' });
const hollow = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const housing = () => ({ ...hollow(), structure: 'sm_extractor' });

function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
}

function setup(seed = 880001) {
  const state = createGameState(seed);
  const bus = createBus();
  const damageCalls = [];
  const ctx = {
    state,
    bus,
    helpers: { routeCombatDamage(req) { damageCalls.push(req); return { ok: true }; } },
    registry: { get() { return null; } },
  };
  cargo.init(ctx);
  drill.init(ctx);
  state.player.cargo = { items: {}, usedVolume: 0, capVolume: 100, capMass: 100 };
  state.player.credits = 2000;
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, { id: state.playerId, hull: 100, hullMax: 100, data: {} });
  }
  if (!state.entities.has(seed)) {
    state.entities.set(seed, { id: seed, data: {} });
  }
  assert.ok(drill.begin(seed), 'drill session begins');
  return { state, bus, damageCalls };
}

function fillAll(state, tile) {
  const d = state.drill;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) d.field[c][r] = { ...tile };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. First contact past the fall line warns — never drops — even when machine
//    housing terminates a headroom column. Housing is a beam, never a crack.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup();
  fillAll(state, rock());
  const d = state.drill;
  const creaks = [];
  const caveIns = [];
  bus.on('drill:rockCreak', (p) => creaks.push(p));
  bus.on('drill:caveIn', (p) => caveIns.push(p));

  // Six-cell hall at row 10, open headroom at row 9, roof at row 8 — with a machine
  // housing ending column 10's air column (a beam that can never crack).
  for (let c = 10; c <= 15; c++) { d.field[c][10] = hollow(); d.field[c][9] = hollow(); }
  d.field[10][8] = housing();
  d.avatar.col = 20; d.avatar.row = 20;

  drill._structCheck(d, 12, 10);
  assert.equal(creaks.length, 1, 'first contact is a warning, housing or not');
  assert.equal(creaks[0].cells.length, 5, 'the five rock beams cracked — the housing did not');
  assert.equal(caveIns.length, 0, 'a never-warned span must not fall');
  assert.equal(d.field[11][8].cracked, true, 'the roof cells carry their crack');
  assert.equal(d.field[11][8].type, 'rock', 'the roof still stands');

  // Control — identical geometry without the machine behaves the same way.
  const s2 = setup(880002);
  fillAll(s2.state, rock());
  const d2 = s2.state.drill;
  const creaks2 = [];
  const caveIns2 = [];
  s2.bus.on('drill:rockCreak', (p) => creaks2.push(p));
  s2.bus.on('drill:caveIn', (p) => caveIns2.push(p));
  for (let c = 10; c <= 15; c++) { d2.field[c][10] = hollow(); d2.field[c][9] = hollow(); }
  d2.avatar.col = 20; d2.avatar.row = 20;
  drill._structCheck(d2, 12, 10);
  assert.equal(creaks2.length, 1);
  assert.equal(caveIns2.length, 0, 'plain-rock first contact also warns only');
  console.log(JSON.stringify({ ok: true, section: 'first-contact-warns' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Widening a span whose cracks already stand drops the whole beam — rubble on
//    the lowest open cell — while machine housing in the pattern survives.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup(880003);
  fillAll(state, rock());
  const d = state.drill;
  const caveIns = [];
  const breaks = [];
  bus.on('drill:caveIn', (p) => caveIns.push(p));
  bus.on('drill:break', (p) => breaks.push(p));
  for (let c = 10; c <= 15; c++) { d.field[c][10] = hollow(); d.field[c][9] = hollow(); }
  d.field[10][8] = housing();
  d.avatar.col = 20; d.avatar.row = 20;

  drill._structCheck(d, 12, 10);                      // first contact — cracks only
  d.field[16][10] = hollow(); d.field[16][9] = hollow();
  drill._structCheck(d, 16, 10);                      // the widening the roof answers

  assert.equal(caveIns.length, 1, 'the widened cracked span falls');
  assert.equal(caveIns[0].fell.length, 6, 'six roof cells dropped — the housing is not one');
  assert.equal(d.field[11][8].type, 'empty', 'the beam opened');
  assert.equal(d.field[10][8].structure, 'sm_extractor', 'the machine survived the fall');
  assert.equal(d.field[11][10].type, 'dirt', 'rubble fills the hall floor');
  assert.equal(d.field[11][10].rubble, true, 'the fill is marked rubble');
  const ent = state.entities.get(d.asteroidId);
  assert.ok(ent.data.drillRubble.includes(10 * COLS + 11), 'rubble persists on the rock record');
  assert.ok(ent.data.drillCleared.includes(8 * COLS + 11), 'the opened roof is remembered');
  assert.ok(!ent.data.drillCleared.includes(10 * COLS + 11), 'the buried cell is not cleared');
  console.log(JSON.stringify({ ok: true, section: 'widened-span-falls' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. A fall column open to the field's bottom still fills — the lowest open cell
//    is the last row, not "no floor, no fall".
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup(880004);
  fillAll(state, rock());
  const d = state.drill;
  const caveIns = [];
  bus.on('drill:caveIn', (p) => caveIns.push(p));
  for (let c = 10; c <= 15; c++) { d.field[c][10] = hollow(); d.field[c][9] = hollow(); }
  for (let r = 9; r < ROWS; r++) d.field[12][r] = hollow(); // column 12 air to the bottom
  d.avatar.col = 20; d.avatar.row = 20;

  drill._structCheck(d, 11, 10);                      // cracks stand
  d.field[16][10] = hollow(); d.field[16][9] = hollow();
  drill._structCheck(d, 16, 10);                      // widen -> fall

  assert.equal(caveIns.length, 1);
  assert.equal(d.field[12][8].type, 'empty', 'the bottomless column\'s roof also falls');
  const landing = caveIns[0].dropped.find((p) => p.col === 12);
  assert.equal(landing.row, ROWS - 1, 'rubble rests on the last open row of the shaft');
  assert.equal(d.field[12][ROWS - 1].type, 'dirt');
  assert.equal(d.field[12][ROWS - 1].rubble, true);
  console.log(JSON.stringify({ ok: true, section: 'bottomless-column' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The rig standing in the landing cell pays the authored hull fraction.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus, damageCalls } = setup(880005);
  fillAll(state, rock());
  const d = state.drill;
  bus.on('drill:caveIn', () => {});
  for (let c = 10; c <= 15; c++) { d.field[c][10] = hollow(); d.field[c][9] = hollow(); }
  d.avatar.col = 11; d.avatar.row = 10;               // the rig waits in the hall floor
  drill._structCheck(d, 11, 10);                      // cracks stand
  d.field[16][10] = hollow(); d.field[16][9] = hollow();
  drill._structCheck(d, 16, 10);                      // widen -> the beam drops on the rig

  const packet = damageCalls.find((c) => c.origin && c.origin.kind === 'deep_core_cavein');
  assert.ok(packet, 'the rig under the fill routes a damage packet');
  assert.equal(packet.origin.col, 11, 'the fall column names the rig\'s column');
  assert.equal(packet.origin.row, 10, 'the landing cell is the hall floor the rig stood on');
  const rigs2 = setup(880006);
  fillAll(rigs2.state, rock());
  const d2 = rigs2.state.drill;
  for (let c = 10; c <= 15; c++) { d2.field[c][10] = hollow(); d2.field[c][9] = hollow(); }
  d2.avatar.col = 11; d2.avatar.row = 9;              // a rig ABOVE the landing cell is spared
  drill._structCheck(d2, 11, 10);
  d2.field[16][10] = hollow(); d2.field[16][9] = hollow();
  drill._structCheck(d2, 16, 10);
  assert.ok(!rigs2.damageCalls.some((c) => c.origin && c.origin.kind === 'deep_core_cavein'),
    'a rig standing above the fill is untouched');
  console.log(JSON.stringify({ ok: true, section: 'avatar-under-fall' }));
}

console.log('drill-struct-check: all assertions passed');
