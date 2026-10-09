import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import { VESTA_DERELICT_SALVAGE_SOURCE } from '../src/data/sectorZones.js';
import { lawSecurity as lawSecurityProto } from '../src/systems/lawSecurity.js';
import { npcJobsRuntime as npcJobsRuntimeProto } from '../src/systems/npcJobsRuntime.js';
import { salvage as salvageProto } from '../src/systems/salvage.js';
import { bountyHunt as bountyHuntProto } from '../src/systems/bountyHunt.js';
import { QUARRY_TUNING } from '../src/data/bountyHunters.js';

function bootOwner(proto, seed) {
  const state = createGameState(seed);
  const bus = createBus();
  const system = Object.assign({}, proto);
  const helpers = {};
  system.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { state, system };
}

function resetOnly(name, system) {
  resetFreshRunSystems({
    get(requested) {
      return requested === name ? system : null;
    },
  });
}

test('fresh-run order clears law and durable identity owners before rematerialization', () => {
  const lawIndex = FRESH_RUN_SYSTEMS.indexOf('lawSecurity');
  const jobsIndex = FRESH_RUN_SYSTEMS.indexOf('npcJobsRuntime');
  const salvageIndex = FRESH_RUN_SYSTEMS.indexOf('salvage');
  const worldIndex = FRESH_RUN_SYSTEMS.indexOf('world');
  const trafficIndex = FRESH_RUN_SYSTEMS.indexOf('traffic');

  assert.ok(lawIndex >= 0, 'lawSecurity participates in canonical New Game reset');
  assert.ok(jobsIndex >= 0, 'npcJobsRuntime participates in canonical New Game reset');
  assert.ok(salvageIndex >= 0, 'salvage participates in canonical New Game reset');
  assert.ok(lawIndex < jobsIndex, 'law releases old NPC-job response claims before jobs are cleared');
  assert.ok(jobsIndex < worldIndex, 'virtual jobs clear before world rematerialization');
  assert.ok(salvageIndex < worldIndex, 'durable salvage clears before world rematerialization');
  assert.ok(jobsIndex < trafficIndex, 'virtual jobs clear before traffic rematerialization');
});

test('canonical New Game clears a prior law incident attacker identity', () => {
  const { state, system } = bootOwner(lawSecurityProto, 101);
  state.lawSecurity.incidents = {
    'station_helios:old-attacker': {
      attackerId: 1,
      targetId: 44,
      status: 'responding',
    },
  };
  state.player.lawfulInspection = { active: { patrolEntityId: 1 } };

  resetOnly('lawSecurity', system);

  assert.deepEqual(state.lawSecurity.incidents, {});
  assert.equal(state.player.lawfulInspection, undefined);
});

test('canonical New Game clears virtual NPC jobs before a same-worldRecordId actor can adopt them', () => {
  const { state, system } = bootOwner(npcJobsRuntimeProto, 102);
  state.npcJobs.byId['job:wr_reused'] = {
    worldRecordId: 'wr_reused',
    entityId: null,
    kind: 'hauler',
    job: {
      id: 'job:wr_reused',
      route: [{ id: 'old-route', pos: { x: 12, z: 34 } }],
      payload: { commodityId: 'cmdty_old_payload', qty: 9 },
      binding: { stationId: 'station_old' },
    },
  };

  resetOnly('npcJobsRuntime', system);

  // revision is an intentional membership dirty counter (_invalidateJobIds bumps it during
  // newGame); pin the cleared collections, not the bag's exact key set.
  assert.deepEqual(state.npcJobs.byId, {});
  assert.deepEqual(state.npcJobs.siteCouriers, {});
  assert.deepEqual(state.npcJobs.lots, {});
  assert.ok(Number.isInteger(state.npcJobs.revision) && state.npcJobs.revision >= 0);
});

test('canonical New Game clears the durable Vesta extraction ledger', () => {
  const { state, system } = bootOwner(salvageProto, 103);
  const sourceKey = VESTA_DERELICT_SALVAGE_SOURCE.sourceKey;
  const stale = system._sourceRecord(sourceKey, true);
  stale.remainingPool = {};
  stale.claimId = null;
  stale.extractedBy = 'old-salvor';
  stale.extracted = true;
  state.salvage.sortPockets = [{ id: 'old-sort-pocket', phase: 'held' }];

  resetOnly('salvage', system);

  // The salvage owner's canonical default also clears physical sorting-pocket ownership.
  // Keep the exact empty-state assertion rather than accepting a stale pocket across New Game.
  assert.deepEqual(state.salvage, { points: [], plannedSectorId: null, sortPockets: [], sources: {} });
  const fresh = system._sourceRecord(sourceKey, true);
  assert.equal(fresh.extracted, false);
  assert.equal(system._claimSource({ sourceKey, claimantId: 'fresh-salvor' }).ok, true);
  assert.equal(system._takeSource({ sourceKey, claimantId: 'fresh-salvor' }).ok, true);
});

test('canonical New Game resets the retained bounty schedule and outcome ledger without re-init', () => {
  const { state, system } = bootOwner(bountyHuntProto, 4242);
  const subscriptions = system._subs.slice();
  state.bountyHunt = { schemaVersion: 1, outcomes: { old: { paid: true } },
    stageSerial: 19, nextStageAt: 900, activeStaged: { contractId: 'old', stagedAt: 700 } };
  system._huntersQuiet = { membership: 12 };
  system._hunterWakeSeq = 88;
  resetOnly('bountyHunt', system);
  assert.deepEqual(state.bountyHunt, { schemaVersion: 1, outcomes: {}, stageSerial: 0,
    nextStageAt: null, activeStaged: null });
  assert.deepEqual(system._subs, subscriptions);
  assert.equal(system._huntersQuiet, null);
  assert.equal(system._hunterWakeSeq, 0);
  state.mode = 'flight'; state.simTime = 0;
  system.update(1 / 60, state);
  assert.equal(state.bountyHunt.nextStageAt, QUARRY_TUNING.firstStageDelayS);
});
