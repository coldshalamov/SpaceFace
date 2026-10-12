import test from 'node:test';
import assert from 'node:assert/strict';
import { drill } from '../src/systems/drill.js';
import { fieldDepletion, recordFieldExtraction, FIELD_DEPLETION_MAX_DELTA } from '../src/systems/fieldDepletion.js';

function rig(capVolume = 1000) {
  const cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume, capMass: 10000 };
  const rock = { id: 42, type: 'asteroid', alive: true,
    data: { fieldId: 'field_test', yieldU: 500, drillYieldMax: 500, drillDepletion: 0, lastDrillT: 100 } };
  const state = { meta: { seed: 4242 }, simTime: 100, tick: 6000, playerId: 1,
    player: { cargo, miningBeam: { tierId: 'beam_mk1', dps: 20 } },
    world: { currentSectorId: 'sector_test' },
    entities: new Map([[42, rock], [1, { id: 1, type: 'ship', alive: true, hull: 100, hullMax: 100, data: {} }]]),
    fieldDepletion: { schemaVersion: 2, fields: {}, receipts: [] }, rng: () => 0.5 };
  const bus = { on: () => () => {}, emit() {} };
  const sys = Object.create(drill); sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  sys.begin(42);
  function bite(qty) {
    const d = state.drill, col = d.avatar.col, row = d.avatar.row + 1;
    d.field[col][row] = { type: 'vein', hp: 0.001, maxHp: 1, ore: 'cmdty_silicate', yieldU: qty,
      hazard: false, tierReq: 1, hardness: 1 };
    const before = d.yieldLog.cmdty_silicate || 0;
    for (let i = 0; i < 60 && (d.yieldLog.cmdty_silicate || 0) === before; i++) {
      sys.tickInput({ left: false, right: false, up: false, down: true }, 1 / 60);
    }
  }
  return { state, sys, bite, cargo, record: () => state.fieldDepletion.fields.field_test };
}

test('cargo acceptance immediately books field extraction without pretending the asteroid died', () => {
  const r = rig(); r.bite(4);
  assert.equal(r.cargo.items.cmdty_silicate, 4);
  assert.equal(r.record()?.extractedU, 4, 'a save can happen before the exit report');
  assert.equal(r.record()?.destroyedCount, 0);
  assert.equal(r.record()?.depletion, 0.01);
  r.sys.end(); assert.equal(r.record()?.extractedU, 4, 'the exit report cannot book it twice');
});

test('a snapshot taken inside the bore preserves extraction after the transient drill closes on load', () => {
  const r = rig(); r.bite(5);
  const ledger = Object.create(fieldDepletion); ledger.state = r.state;
  const saved = JSON.parse(JSON.stringify(ledger.serialize()));
  ledger.deserialize(saved); r.sys.deserialize();
  assert.equal(r.state.drill, null); assert.equal(r.record()?.extractedU, 5);
  assert.equal(r.record()?.destroyedCount, 0);
});

test('refused ore leaves field extraction unchanged', () => {
  const r = rig(0); r.bite(4);
  assert.equal(r.cargo.items.cmdty_silicate, undefined);
  assert.equal(r.record()?.extractedU || 0, 0);
  r.sys.end(); assert.equal(r.record()?.extractedU || 0, 0);
});

test('incremental batches retain the original per-session depletion cap', () => {
  const state = { simTime: 100, fieldDepletion: { fields: {}, receipts: [] } };
  let before = 0;
  for (const extractedU of [8, 12, 40]) {
    recordFieldExtraction(state, { fieldId: 'field_test', extractedU, batchExtractedBeforeU: before, destroyed: false });
    before += extractedU;
  }
  assert.equal(state.fieldDepletion.fields.field_test.extractedU, 60);
  assert.equal(state.fieldDepletion.fields.field_test.depletion, FIELD_DEPLETION_MAX_DELTA);
  assert.equal(state.fieldDepletion.fields.field_test.destroyedCount, 0);
});

test('legacy unbooked session yield still settles once on retract', () => {
  const r = rig(); r.state.drill.yieldLog = { cmdty_silicate: 7 };
  delete r.state.drill.fieldRecordedU;
  r.sys.end(); assert.equal(r.record()?.extractedU, 7); assert.equal(r.record()?.destroyedCount, 0);
  r.sys.end(); assert.equal(r.record()?.extractedU, 7);
});
