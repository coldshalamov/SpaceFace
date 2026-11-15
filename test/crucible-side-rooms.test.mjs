import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { SWARM_EVENT_TABLES } from '../src/data/swarmEvents.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

for (const arenaId of ['ceres_belt', 'tethys_hub']) {
  test(`${arenaId} keeps furniture between waves and cleans it on exit`, t => {
    const state = createGameState(7), bus = createBus();
    const player = { id: 1, type: 'ship', team: 0, alive: true, radius: 8, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
    state.playerId = 1; state.entities.set(1, player); state.entityList.push(player);
    let id = 10;
    const helpers = { spawnEntity(spec) { const e = { ...spec, id: id++, alive: true }; state.entities.set(e.id, e); state.entityList.push(e); return e; } };
    const owner = Object.create(survivalArena);
    owner.init({ state, bus, helpers, registry: { get: () => null } });
    t.after(() => owner.destroy());
    state.run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
    Object.assign(state.run, { arenaId, wave: 1, phase: 'active' });
    const plan = planWave({ seed: 7, arenaId, wave: 1 });
    const arm = () => bus.emit('run:wavePlanned', { wave: 1, plan });
    const furniture = () => state.entityList.filter(e => e.alive && e.data?.roomOwner === 'survival-arena');
    arm();
    const first = furniture();
    assert.ok(first.length >= 6 && first.length <= 12);
    if (arenaId === 'ceres_belt') {
      const rocks = first.filter(e => e.data.roomToyId?.startsWith('claim_rock_'));
      assert.ok(rocks.length >= 3 && rocks.every(e => e.physicsBody.dynamic && isAttachable(e, state.playerId, state)));
      assert.equal(first.filter(e => e.data.roomToyId?.startsWith('claim_stack_')).length, 2);
      assert.ok(first.some(e => e.data.roomToyId === 'claim_beacon'));
      assert.deepEqual(SWARM_EVENT_TABLES.ceres_belt, ['mine_drift', 'supply_drop', 'rock_rain']);
    } else {
      assert.ok(first.filter(e => e.data.roomToyId?.startsWith('toll_gate_')).length >= 4);
      assert.ok(SWARM_EVENT_TABLES.tethys_hub.includes('supply_drop'));
    }
    bus.emit('run:waveCleared', {});
    state.run.wave = 2;
    player.pos.x = 500;
    bus.emit('run:wavePlanned', { wave: 2, plan: planWave({ seed: 7, arenaId, wave: 2 }) });
    assert.ok(first.every(e => e.alive), 'furniture persists between waves');
    assert.deepEqual(furniture(), first);
    if (arenaId === 'tethys_hub') assert.equal(owner._freight._armed.lane.x0, -400, 'traffic stays on the original lane');
    bus.emit('run:ended', {});
    assert.equal(furniture().length, 0);
  });
}
