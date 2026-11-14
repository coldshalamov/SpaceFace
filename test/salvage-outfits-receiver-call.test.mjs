import test from 'node:test';
import assert from 'node:assert/strict';
import { salvageOutfits } from '../src/features/salvageOutfits/index.js';
import { freshSalvageOutfits, makeSalvageMeeting, normalizeSalvageOutfits } from '../src/features/salvageOutfits/persistence.js';

function fixture() {
  const row = freshSalvageOutfits();
  const m = makeSalvageMeeting({ id: 'test:receiving', sectorId: 'sector_ceres_belt', anchor: { x: 0, z: 0 }, variant: 'split_drift', memory: row.memory });
  row.meetings[m.id] = m;
  const player = { pos: { x: 300, z: 0 }, ready: true };
  const body = { pos: { x: 250, z: 0 }, ready: true, lined: true };
  const crew = {};
  const events = [];
  const owner = { _row: row, _now: () => 10, _player: () => player,
    physical: { find: key => key === m.bodies.frame.key ? body : key === m.crews.keel.key ? crew : null,
      playerLine: e => e.lined, nativeReady: e => e.ready, withinDelivery: () => false },
    _say: (id, text) => events.push({ id, text }), _deliver: () => { throw Error('advice must not unload'); } };
  return { owner, row, m, player, body, events, run: () => salvageOutfits._receivePlayer.call(owner, m) };
}

test('receiving crew notices the actual player cable once without changing the agreement or stock', () => {
  const h = fixture(), before = JSON.stringify(h.m.bodies);
  h.run(); h.run();
  assert.equal(h.events.length, 1); assert.equal(h.events[0].id, 'keel');
  assert.match(h.events[0].text, /ship AND load/);
  assert.match(h.events[0].text, /Keep the cable on/);
  assert.equal(JSON.stringify(h.m.bodies), before);
  assert.equal(h.m.agreement, null);
  const restored = normalizeSalvageOutfits(JSON.parse(JSON.stringify(h.row)));
  assert.equal(restored.meetings[h.m.id].receipts[`${h.m.id}:receiving-call:frame`].kind, 'receiving_call');
  h.m.receipts = restored.meetings[h.m.id].receipts;
  h.run(); assert.equal(h.events.length, 1);
});

test('remote, unobserved, loose, completed cargo and absent crews do not speak', () => {
  for (const change of [h => h.player.pos.x = 0, h => h.body.pos.x = 0,
    h => h.body.ready = false, h => h.player.ready = false, h => h.body.lined = false,
    h => h.m.bodies.frame.status = 'delivered', h => h.m.crews.keel.status = 'destroyed']) {
    const h = fixture(); change(h); h.run(); assert.equal(h.events.length, 0);
    assert.deepEqual(h.m.receipts, {});
  }
});

test('radio reentry cannot duplicate advice; restoring during a call cannot receive old cargo', () => {
  const h = fixture();
  h.owner._say = () => { h.events.push('call'); h.run(); h.owner._restoring = true; h.owner.physical.withinDelivery = () => true; };
  h.run(); assert.deepEqual(h.events, ['call']);
  assert.equal(Object.keys(h.m.receipts).length, 1);
});
