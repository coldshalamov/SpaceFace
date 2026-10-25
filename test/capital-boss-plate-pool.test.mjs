import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapitalBossFight } from '../src/combat/capitalBossScore.js';
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
