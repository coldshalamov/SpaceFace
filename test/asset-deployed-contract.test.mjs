import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { automation as automationProto } from '../src/systems/automation.js';
import { missions as missionsProto } from '../src/systems/missions.js';

function makeBeatSixHarness({ legacy = false } = {}) {
  const state = createGameState(0x47a6);
  state.mode = 'flight';
  state.simTime = 60;
  state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.entities.set(1, {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  });

  const bus = createBus();
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state,
    bus,
    helpers: { voice: { say: () => true } },
    registry: { get: () => null },
  });
  missions.newGame();
  state.missions.active = [];
  state.story.beatIndex = 6;
  state.story.branch = 'traders';
  state.story.flags = legacy
    ? { elroy_outcome_legacy: true }
    : { elroy_outcome: 'force', proving_ground_complete: true };
  missions._syncCampaignSidecarAfterAdvance();
  return { state, bus, missions };
}

for (const { label, deployment } of [
  {
    label: 'trader deployment',
    deployment: { kind: 'trader', id: 'trader-1', defId: 'trader_hauler_l' },
  },
  {
    label: 'automation outpost deployment',
    deployment: {
      kind: 'outpost', id: 'outpost-1', defId: 'outpost_refinery', sectorId: 'sector_ceres_belt',
    },
  },
  {
    label: 'commissioned claim outpost deployment',
    deployment: {
      kind: 'outpost', id: 'claim-1', claimSpecId: 'spec_refinery', source: 'claims',
    },
  },
]) {
  test(`non-legacy beat six accepts a real ${label}`, () => {
    const h = makeBeatSixHarness();

    h.bus.emit('asset:deployed', deployment);

    assert.equal(h.state.story.beatIndex, 7);
    assert.equal(h.state.story.flags.empire_seed_asset_id, deployment.id);
  });
}

test('a pre-existing trader profit cycle does not count as a legacy deployment', () => {
  const h = makeBeatSixHarness({ legacy: true });
  h.state.player.credits = 100_000;
  const deployed = [];
  const cycles = [];
  h.bus.on('asset:deployed', (payload) => deployed.push(payload));
  h.bus.on('automation:traderCycleCompleted', (payload) => cycles.push(payload));

  const automation = Object.assign({}, automationProto);
  automation.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: () => null },
  });
  h.state.automation.traders.push({
    id: 'pre-existing-trader',
    defId: 'trader_hauler_l',
    tier: 1,
    route: {
      from: 'station_helios',
      to: 'station_tethys',
      good: 'cmdty_ore_iron',
    },
    cycleProgress: 1,
    cycleTime: 180,
    cargoVol: 80,
    lastCycleProfit: 0,
    upkeepPerMin: 18,
    hotness: 0,
    status: 'enroute',
    ratePerMin: 0,
  });

  automation.update(1, h.state);

  assert.equal(h.state.story.beatIndex, 6);
  assert.deepEqual(deployed, []);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].id, 'pre-existing-trader');

  assert.equal(automation.hireTrader('trader_hauler_l'), true);
  assert.equal(h.state.story.beatIndex, 7, 'a real deployment still completes a legacy save');
  assert.equal(deployed.length, 1);
  assert.equal(deployed[0].defId, 'trader_hauler_l');
});
