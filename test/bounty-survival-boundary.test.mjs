import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createRunState } from '../src/core/runState.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { crucibleHullSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { applySandboxSetup } from '../src/ui/sandbox/sandboxSetup.js';
import { makeBountyHunterSpec, makeBountyQuarrySpec } from '../src/systems/bountyHunt.js';
import { QUARRY_TUNING } from '../src/data/bountyHunters.js';

const SEED = 4242;
function launch(ruleset = 'swarm') {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: SEED });
  const state = runtime.state;
  state.mode = 'loading'; state.ui.screenStack = [];
  const setup = crucibleHullSetupFor({ hullId: 'ship_hornet', seed: SEED, swarmStake: 'contender' }).value;
  runtime.getSystem('ships').buyShip({ defId: setup.hullId, setActive: true, grant: true });
  const player = runtime.spawn(makeShipEntitySpec(setup.hullId, { isPlayer: true, player: state.player, pos: { x: 0, z: 0 } }));
  state.playerId = player.id;
  applySandboxSetup({ state, bus: runtime.bus, registry: { get: name => runtime.getSystem(name) },
    helpers: runtime.getHelpers() }, crucibleLaunchConfig(setup, ruleset, { openingLesson: false, swarmStake: 'contender' }));
  state.mode = 'flight';
  // Keep the actual mode setup, but make the staging census permissive so a ship-cap
  // refusal cannot accidentally pass this mode-boundary test.
  for (const entity of [...state.entityList]) {
    if (entity.id !== state.playerId) runtime.getHelpers().removeEntity(entity.id, { immediate: true });
  }
  assert.equal(state.entityIndex.ships.length, 1);
  return { runtime, state, player, hunt: runtime.getSystem('bountyHunt') };
}

test('actual Survival/Swarm setup excludes ambient bounty staging in every non-inactive run phase', () => {
  for (const ruleset of ['swarm', 'scored']) {
    const h = launch(ruleset);
    try {
      assert.equal(h.state.run.kind, 'survival');
      assert.equal(h.state.run.ruleset, ruleset);
      assert.notEqual(h.state.run.phase, 'inactive');
      const staged = [];
      h.runtime.bus.on('bountyHunt:staged', p => staged.push(p));
      h.state.bountyHunt.nextStageAt = 0;
      h.state.simTime = QUARRY_TUNING.firstStageDelayS + 1;
      for (const phase of ['loadout', 'draft', 'wave_intro', 'active', 'cleanup', 'refit', 'ended']) {
        h.state.run.phase = phase;
        h.hunt.update(1 / 60, h.state);
        assert.equal(staged.length, 0, `${ruleset}:${phase}`);
        assert.equal(h.state.entityIndex.ships.length, 1, `${ruleset}:${phase}`);
        assert.equal(h.state.bountyHunt.nextStageAt, 0, 'the arena must not advance Adventure staging cadence');
      }
    } finally { h.runtime.dispose(); }
  }
});

test('the staging boundary preserves existing contract-hunter processing in a live run', () => {
  const h = launch();
  try {
    const quarry = h.runtime.spawn(makeBountyQuarrySpec({ contractId: 'explicit-contract', pos: { x: 1200, z: 0 } }));
    const hunter = h.runtime.spawn(makeBountyHunterSpec({ contractId: 'explicit-contract', contractTargetId: quarry.id,
      pos: { x: 900, z: 0 } }));
    h.state.run.phase = 'active';
    h.state.bountyHunt.nextStageAt = 0;
    h.state.simTime = QUARRY_TUNING.firstStageDelayS + 1;
    h.hunt.update(1 / 60, h.state);
    assert.equal(hunter.data.bountyHunt.pursuing, true);
    assert.equal(hunter.data.intent.targetId, quarry.id);
    assert.equal(h.state.bountyHunt.stageSerial, 0);
  } finally { h.runtime.dispose(); }
});

test('Adventure and inactive Survival preserve the original first-stage delay and admit one chase', () => {
  for (const kind of ['adventure', 'survival']) {
    const h = launch();
    try {
      h.state.run = createRunState({ kind, ruleset: kind === 'survival' ? 'swarm' : null, seed: SEED });
      assert.equal(h.state.run.phase, 'inactive');
      h.hunt.newGame();
      const staged = [];
      h.runtime.bus.on('bountyHunt:staged', p => staged.push(p));
      h.state.simTime = 0;
      h.hunt.update(1 / 60, h.state);
      assert.equal(h.state.bountyHunt.nextStageAt, QUARRY_TUNING.firstStageDelayS);
      assert.equal(staged.length, 0);
      h.state.simTime = QUARRY_TUNING.firstStageDelayS + 1;
      h.hunt.update(1 / 60, h.state);
      assert.equal(staged.length, 1, kind);
      assert.equal(staged[0].contractId, 'bounty:staged:1');
      assert.equal(h.state.entityIndex.ships.length, 3, kind);
    } finally { h.runtime.dispose(); }
  }
});
