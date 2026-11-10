import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

function attachment(id, state = 'broken') {
  return {
    id, state, defId: 'tether_standard', ownerId: 1, targetId: 2,
    restLength: 25, lastTension: 0, lastImpulse: 0,
    sourceAnchorLocal: { x: 0, y: 0, z: 2 }, targetAnchorLocal: { x: 0, y: 0, z: 0 },
    tetherPolicy: { spring: { K: 180, zeta: 0.7 }, maxTension: 1050000 },
    masslineRuntime: { state: 'holding', extension: 0, peakTension: 0 },
    masslineTelemetry: { state: 'holding', tension: 0, impulse: 0 },
    historyDetail: 'retained history '.repeat(150),
  };
}

test('one live cable transports its delta without cloning the broken cable history', () => {
  const byId = Object.fromEntries(Array.from({ length: 128 }, (_, i) => [`cut_${i}`, attachment(`cut_${i}`)]));
  byId.live = attachment('live', 'active');
  const state = { combat: { attachments: { nextId: 130, byId } } };
  const differ = createDomainDiffer();
  const facade = new Map();
  const apply = (tick) => {
    const diff = differ.diff(state, tick);
    for (const update of diff.updates) applyDomainPathUpdate(facade, update, new Set());
    return diff.updates.filter((u) => u.segs[0] === 'combat');
  };
  apply(0);
  const mirrored = facade.get('combat').attachments;
  const cut = mirrored.byId.cut_0;
  const live = mirrored.byId.live;
  assert.notEqual(live, byId.live, 'the transport remains detached from authority');

  for (let tick = 1; tick <= 3; tick++) {
    byId.live.lastTension = 100 * tick;
    byId.live.masslineTelemetry.tension = 100 * tick;
    const updates = apply(tick);
    assert.deepEqual(updates.map((u) => u.segs.join('.')), ['combat.attachments.byId.live']);
    assert.ok(updates[0].bytes < 4000, 'one changed cable has a bounded row payload');
    assert.equal(mirrored.byId.live, live, 'live cable identity survives updates');
    assert.equal(mirrored.byId.cut_0, cut, 'old cables are neither cloned nor reapplied');
    assert.equal(live.masslineTelemetry.tension, 100 * tick, 'telemetry arrives on every body reply');
  }

  byId.live.state = 'broken';
  byId.live.breakReason = 'tether_cut';
  delete byId.cut_0;
  byId.new_line = attachment('new_line', 'active');
  state.combat.attachments.nextId++;
  apply(4);
  assert.equal(live.state, 'broken', 'cut is visible immediately');
  assert.equal(mirrored.byId.cut_0, undefined, 'pruning is visible immediately');
  assert.equal(mirrored.byId.new_line.state, 'active', 'admission is visible immediately');
  assert.equal(mirrored.nextId, 131);

  // Broken records remain complete, mutable mirrors; this optimization does not assume that
  // terminal state is immutable or drop retained fields that another presentation reader needs.
  byId.cut_1.historyDetail = 'repaired imported history';
  apply(5);
  assert.equal(mirrored.byId.cut_1.historyDetail, 'repaired imported history');

  state.combat.attachments.byId = null;
  apply(6);
  assert.equal(mirrored.byId, null);
  state.combat.attachments.byId = {};
  apply(7);
  assert.deepEqual(mirrored.byId, {}, 'an empty restored dictionary replaces a scalar mirror');
  state.combat.attachments.byId.restored = attachment('restored', 'active');
  apply(8);
  assert.deepEqual(mirrored.byId, state.combat.attachments.byId);
});

for (const path of ['attachments', 'byId']) {
  test(`attachment ${path} resets remain exact through repeated dictionary/null cycles`, () => {
    const state = { combat: { attachments: { nextId: 2, byId: { live: attachment('live', 'active') } } } };
    const differ = createDomainDiffer();
    const facade = new Map();
    const sourceOwner = path === 'attachments' ? state.combat : state.combat.attachments;
    const readMirror = () => path === 'attachments'
      ? facade.get('combat').attachments : facade.get('combat').attachments.byId;
    const values = [sourceOwner[path], null, {}, null, {}, null,
      path === 'attachments' ? { nextId: 3, byId: { restored: attachment('restored', 'active') } }
        : { restored: attachment('restored', 'active') }, null];
    values.forEach((value, tick) => {
      sourceOwner[path] = value;
      for (const update of differ.diff(state, tick).updates) {
        applyDomainPathUpdate(facade, update, new Set());
      }
      assert.deepEqual(readMirror(), value, `reset at reply ${tick}`);
    });
  });
}
