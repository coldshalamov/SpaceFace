import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
  createDomainProbeChecker,
} from '../scripts/lib/simReadModel.mjs';

const DOMAIN_ENUM_TICKS = 10;

test('shared-store status reaches the next reply without the save metadata cadence', () => {
  const state = { save: { sharedStoreStatus: { syncPending: true, mirrorHealthy: false } } };
  const differ = createDomainDiffer();
  const mirror = new Map();
  const apply = (tick) => {
    const result = differ.diff(state, tick);
    for (const update of result.updates) applyDomainPathUpdate(mirror, update, new WeakSet());
    return result;
  };
  apply(0);
  state.save.sharedStoreStatus = { syncPending: false, mirrorHealthy: true };
  const settled = apply(1);
  assert.ok(settled.updates.some((update) => update.segs[0] === 'save.sharedStoreStatus'));
  assert.deepEqual(mirror.get('save.sharedStoreStatus'), { syncPending: false, mirrorHealthy: true });
  state.save.sharedStoreStatus.mirrorHealthy = false;
  apply(2);
  assert.equal(mirror.get('save.sharedStoreStatus').mirrorHealthy, false,
    'in-place health changes also publish on the next reply');
});

function pathIs(update, ...segs) {
  return update && update.segs.length === segs.length
    && update.segs.every((segment, index) => segment === segs[index]);
}

function nextTickWhere(tick, predicate) {
  let next = tick + 1;
  while (!predicate(next)) next++;
  return next;
}

test('domain node cache preserves live children, structural cadence, and probe parity', (t) => {
  configureDomainMirroring({});
  t.after(() => configureDomainMirroring({}));

  const state = {
    economy: {
      markets: {
        station_a: { price: 10, revision: 0 },
        station_b: { price: 20, revision: 0 },
      },
    },
    fuel: { current: 0, max: 100 },
    survivalDraftPublic: { revision: 0, phase: 'base' },
    run: null,
  };
  const differ = createDomainDiffer({ probe: true });
  const mirror = new Map();
  const checker = createDomainProbeChecker(mirror);

  function applyPass(result, tick) {
    for (const update of result.updates) {
      applyDomainPathUpdate(mirror, update, new WeakSet());
    }
    assert.deepEqual(checker.consume(result.probe).events, [], `probe parity at tick ${tick}`);
    assert.equal(mirror.get('fuel').current, state.fuel.current, `hot fuel at tick ${tick}`);
  }

  applyPass(differ.diff(state, 0), 0);
  const marketsNode = differ.paths.get('economy.markets');
  const stationANode = differ.paths.get('economy.markets.station_a');
  const originalStationBNode = differ.paths.get('economy.markets.station_b');
  assert.ok(marketsNode && stationANode && originalStationBNode,
    'expanded market nodes are created on the first pass');

  const offEnum = (tick) => tick % DOMAIN_ENUM_TICKS !== marketsNode.slot % DOMAIN_ENUM_TICKS;
  const stationAIsDue = (tick) => tick % DOMAIN_ENUM_TICKS === stationANode.slot % DOMAIN_ENUM_TICKS;
  const firstOffEnumTick = nextTickWhere(0, (tick) => offEnum(tick) && stationAIsDue(tick));
  const deleteTick = nextTickWhere(firstOffEnumTick, offEnum);
  const readdTick = nextTickWhere(deleteTick, offEnum);
  const enumTick = nextTickWhere(readdTick, (tick) => !offEnum(tick));
  const runObjectTick = enumTick + 1;
  const runNullTick = runObjectTick + 1;
  const runReplacementTick = runNullTick + 1;
  const finalTick = runReplacementTick + 1;

  for (let tick = 1; tick <= finalTick; tick++) {
    state.fuel.current = tick;
    if (tick === firstOffEnumTick) {
      state.economy.markets.station_a.revision = 1;
      state.survivalDraftPublic = { revision: 1, phase: 'urgent' };
    }
    if (tick === deleteTick) delete state.economy.markets.station_b;
    if (tick === readdTick) state.economy.markets.station_b = { price: 21, revision: 1 };
    if (tick === runObjectTick) {
      state.run = { kind: 'arena', phase: 'active', wave: 1, score: 0 };
    }
    if (tick === runNullTick) state.run = null;
    if (tick === runReplacementTick) {
      state.run = { kind: 'arena', phase: 'draft', wave: 2, score: 4 };
    }
    if (tick === finalTick) state.run = null;

    const result = differ.diff(state, tick);
    applyPass(result, tick);

    if (tick === firstOffEnumTick) {
      assert.ok(result.updates.some((update) => pathIs(
        update, 'economy', 'markets', 'station_a',
      )), 'known market changes are walked between enumerations');
      assert.ok(result.updates.some((update) => pathIs(update, 'survivalDraftPublic')),
        'fresh urgent snapshots bypass the normal cadence');
      assert.equal(mirror.get('survivalDraftPublic').revision, 1);
    }
    if (tick === deleteTick) {
      assert.ok(result.updates.some((update) => update.del
        && pathIs(update, 'economy', 'markets', 'station_b')),
      'known market deletion is emitted before the next enumeration');
      assert.equal(Object.hasOwn(mirror.get('economy').markets, 'station_b'), false);
      assert.equal(differ.paths.has('economy.markets.station_b'), false,
        'deleted child leaves both the path and probe tables');
    }
    if (tick === readdTick) {
      assert.equal(result.updates.some((update) => pathIs(
        update, 'economy', 'markets', 'station_b',
      )), false, 'new market waits for its parent enumeration cadence');
      assert.equal(Object.hasOwn(mirror.get('economy').markets, 'station_b'), false);
    }
    if (tick === enumTick) {
      assert.ok(result.updates.some((update) => pathIs(
        update, 'economy', 'markets', 'station_b',
      )), 'new market is admitted on the enumeration pass');
      assert.deepEqual(mirror.get('economy').markets.station_b,
        state.economy.markets.station_b);
      assert.notEqual(differ.paths.get('economy.markets.station_b'), originalStationBNode,
        'delete and re-add receives a fresh cadence node');
    }
    if (tick === runObjectTick) {
      assert.deepEqual(mirror.get('run'), state.run, 'run object expands and ships its leaves');
    }
    if (tick === runNullTick) {
      assert.equal(mirror.get('run'), null, 'run collapse removes children before shipping null');
    }
    if (tick === runReplacementTick) {
      assert.deepEqual(mirror.get('run'), state.run, 'run reset re-expands with fresh children');
    }
    if (tick === finalTick) assert.equal(mirror.get('run'), null);
  }
});

test('dotted mirrors reuse expanded parent nodes across scheduled collapse and re-add', (t) => {
  configureDomainMirroring({ expandPaths: [{ segs: [], depth: 2 }] });
  t.after(() => configureDomainMirroring({}));

  const makeMissions = () => ({
    active: { questId: 'a', stage: 0 },
    completed: { done: 0 },
    failed: { count: 0 },
  });
  const state = {
    missions: makeMissions(),
    fuel: { current: 0, max: 100 },
  };
  const differ = createDomainDiffer({ probe: true });
  const mirror = new Map();
  const checker = createDomainProbeChecker(mirror);

  function applyPass(result, tick) {
    for (const update of result.updates) {
      applyDomainPathUpdate(mirror, update, new WeakSet());
    }
    assert.deepEqual(checker.consume(result.probe).events, [], `probe parity at tick ${tick}`);
  }

  applyPass(differ.diff(state, 0), 0);
  const missionsNode = differ.paths.get('missions');
  assert.strictEqual(missionsNode.kids.get('active'), differ.paths.get('missions.active'),
    'a dotted root reuses the child created by its expanded parent');

  const enumTick = (tick) => tick % 10 === missionsNode.slot % 10;
  const parentReaddTick = 1 + ((missionsNode.slot - 1) % 10);
  const activeReaddTick = parentReaddTick + 10;
  for (let tick = 1; tick <= activeReaddTick; tick++) {
    state.fuel.current = tick;
    if (tick === 1) state.missions = null;
    if (tick === parentReaddTick) state.missions = makeMissions();
    if (tick === parentReaddTick + 1) delete state.missions.active;
    if (tick === activeReaddTick) {
      state.missions.active = { questId: 'b', stage: 1 };
    }
    const result = differ.diff(state, tick);
    applyPass(result, tick);
    if (tick === parentReaddTick || tick === activeReaddTick) {
      assert.ok(enumTick(tick), 're-add is tested on the parent enumeration slot');
      assert.strictEqual(missionsNode.kids.get('active'), differ.paths.get('missions.active'),
        `parent and dotted root share one node after re-add at tick ${tick}`);
    }
  }
});
