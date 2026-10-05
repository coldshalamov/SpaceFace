// D134. Seed 4242. When an entity id returns to the pool, combat locks, nav
// pointers, the mining target, the flyby focus, the bridle ends, and other
// hulls' owner/target ids drop it. The next occupant does not inherit them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';

const SEED = 4242;

test('seed 4242 a recycled id drops every bare pointer that named it', () => {
  const sim = createSimulation({ seed: SEED, systems: [] });
  try {
    assert.equal(sim.state.meta.seed, SEED);
    const victim = sim.spawn({ type: 'ship', pos: { x: 20, z: 0 } });
    const watcher = sim.spawn({ type: 'ship', pos: { x: 40, z: 0 }, data: { combat: { targetId: victim.id, lockTarget: victim.id } } });
    watcher.ownerId = victim.id;
    const id = victim.id;
    sim.state.player.targetId = id;
    sim.state.player.miningTargetId = id;
    sim.state.player.flybyFocus = { targetId: id };
    sim.state.nav = {
      waypoint: { targetEntityId: id },
      autopilot: { targetEntityId: id },
    };
    sim.state.masslineBridle = { sourceId: id, targetId: id };

    victim.alive = false;
    sim.step(SIM_DT);

    assert.equal(sim.state.player.targetId, null);
    assert.equal(sim.state.player.miningTargetId, null);
    assert.equal(sim.state.player.flybyFocus.targetId, null);
    assert.equal(sim.state.nav.waypoint.targetEntityId, null);
    assert.equal(sim.state.nav.autopilot.targetEntityId, null);
    assert.equal(sim.state.masslineBridle.sourceId, null);
    assert.equal(sim.state.masslineBridle.targetId, null);
    assert.equal(watcher.data.combat.targetId, null);
    assert.equal(watcher.data.combat.lockTarget, null);
    assert.equal(watcher.ownerId, null);

    const heir = sim.spawn({ type: 'ship', pos: { x: 21, z: 0 } });
    assert.equal(heir.id, id);
    assert.equal(sim.state.player.targetId, null);
    assert.equal(sim.state.nav.waypoint.targetEntityId, null);
    assert.equal(watcher.data.combat.targetId, null);
  } finally {
    sim.dispose();
  }
});
