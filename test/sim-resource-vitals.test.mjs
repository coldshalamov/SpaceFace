import test from 'node:test';
import assert from 'node:assert/strict';
import { entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals } from '../scripts/lib/simReadModel.mjs';

test('worker resource vitals reach the canonical HUD entity on spawn and later drains', () => {
  const live = { hull:100, hullMax:100, cap:80, capMax:80, boost:{energy:12,max:12} };
  const model = createReadModel();
  applySpawnInfos(model, [{entityId:1,type:'ship',vitals:entityVitalsOf(live)}]);
  const row = model.entities.get(1);
  assert.equal(row.cap, 80);
  assert.equal(row.capMax, 80);
  assert.deepEqual(row.boost, {energy:12,max:12});

  const boost = row.boost;
  live.cap = 0; live.boost.energy = 3;
  applyEntityVitals(model, [[1,entityVitalsOf(live)]]);
  assert.equal(row.cap, 0, 'depleted energy is sent as zero');
  assert.equal(row.boost, boost, 'the boost object remains stable for HUD readers');
  assert.equal(row.boost.energy, 3);
  assert.equal(row.boost.max, 12);

  live.cap = 40; live.boost.energy = 12;
  applyEntityVitals(model, [[1,entityVitalsOf(live)]]);
  assert.equal(row.cap / row.capMax, .5);
  assert.equal(row.boost.energy / row.boost.max, 1);
});

test('non-ship entities do not acquire invented energy or boost resources', () => {
  const model = createReadModel();
  applySpawnInfos(model, [{entityId:2,type:'asteroid',vitals:entityVitalsOf({hull:50})}]);
  const row = model.entities.get(2);
  assert.equal(row.cap, undefined);
  assert.equal(row.boost, undefined);
});
