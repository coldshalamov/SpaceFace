import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { capitalBossReadouts } from '../src/presentation/capitalBossPresentation.js';

test('plate readouts reuse live cells and trim torn or absent plates', () => {
  const fight = createCapitalBossFight({
    encounterId: 'capital_boss_tollman', fightId: 'plate-pool', bossId: 2, targetId: 1,
  });
  fight.started = true;
  const boss = { id: 2, alive: true, hull: 100, hullMax: 100, radius: 20,
    pos: { x: 300, z: 0 }, rot: 0 };
  const state = { playerId: 1, entities: new Map([[2, boss]]),
    capitalBossEncounters: { fights: { 'plate-pool': fight } } };
  const pool = [];
  const readout = capitalBossReadouts(state, pool)[0];
  const plates = readout.plates;
  assert.ok(plates.length >= 2, 'the fixture exercises multiple live plate cells');
  const cells = plates.slice();
  const firstX = cells[0].x;
  boss.pos.x += 40;
  assert.strictEqual(capitalBossReadouts(state, pool)[0], readout);
  assert.strictEqual(readout.plates, plates);
  for (let i = 0; i < cells.length; i += 1) {
    assert.strictEqual(plates[i], cells[i], 'a moving plate reuses its existing cell');
  }
  assert.equal(plates[0].x, firstX + 40, 'reused cells still follow the boss');

  fight.plates[0].attached = false;
  capitalBossReadouts(state, pool);
  assert.equal(plates.length, cells.length - 1);
  assert.strictEqual(plates[0], cells[0], 'surviving plates reuse the compacted prefix');
  assert.equal(plates[0].id, fight.plates[1].id);
  fight.plates = null;
  capitalBossReadouts(state, pool);
  assert.equal(plates.length, 0, 'missing plate records cannot leave stale anchors');
});

test('a broken plate ledger falls back to the hull readout — a corrupted fight is not a stripped colossus', () => {
  const spec = requireCapitalBossEncounter('capital_boss_tollman');
  const authored = spec.plates.map((p) => ({ id: p.id, attached: true, strainTicks: 0 }));
  const fight = createCapitalBossFight({
    encounterId: 'capital_boss_tollman', fightId: 'broken-ledger', bossId: 2, targetId: 1,
  });
  fight.started = true;
  const boss = { id: 2, alive: true, hull: 60, hullMax: 100, radius: 20,
    pos: { x: 300, z: 0 }, rot: 0 };
  const state = { playerId: 1, entities: new Map([[2, boss]]),
    capitalBossEncounters: { fights: { 'broken-ledger': fight } } };
  const readout = () => capitalBossReadouts(state, [])[0];

  // Whole ledger missing — the pre-fix mismatched-clone shape: plated spec, no record.
  fight.plates = null;
  let rd = readout();
  assert.equal(rd.partsLive, false, 'a missing ledger falls back to the hull readout');
  assert.equal(rd.hullFraction, 0.6, 'the fallback answers the hull the record still carries');
  assert.equal(rd.partsAttached, 0, 'no anchors were ever counted');

  // Present but empty — the same corruption shape.
  fight.plates = [];
  assert.equal(readout().partsLive, false, 'an empty ledger is not a stripped colossus');

  // Foreign ids — the array exists but tracks none of the authored plates.
  fight.plates = [{ id: 'plate_not_in_spec', attached: true, strainTicks: 0 }];
  assert.equal(readout().partsLive, false, 'a mismatched ledger never claims 0% parts');

  // Partial coverage — one authored plate unrecorded, its state unknowable — stays on hull.
  fight.plates = [authored[0]];
  assert.equal(readout().partsLive, false, 'a partial ledger is still a broken ledger');

  // The genuine stripped colossus: every authored plate recorded, every one torn.
  fight.plates = authored.map((rec) => ({ ...rec, attached: false }));
  rd = readout();
  assert.equal(rd.partsLive, true, 'a fully torn, fully recorded colossus still reads parts');
  assert.equal(rd.partsAttached, 0, 'honest zero — the record proves the parts are off');
  assert.equal(rd.partsTotal, authored.length);

  // And the healthy fight reads its parts as before.
  fight.plates = authored;
  rd = readout();
  assert.equal(rd.partsLive, true);
  assert.equal(rd.partsAttached, authored.length);
});
