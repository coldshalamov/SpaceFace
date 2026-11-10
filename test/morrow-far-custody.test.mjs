import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {morrow} from '../src/systems/morrow.js';
import {MORROW} from '../src/data/morrow.js';
import {SIM_TIER} from '../src/world/activityClassification.js';
import {tickFarActors, shouldVirtualizeFarActor} from '../src/world/farActorTable.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {resolvePhysicsBodySpec} from '../src/core/physicsAuthority.js';

function fixture() {
  const sim = createSimulation({seed: 4242, systems: [morrow]});
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = MORROW.sectorId;
  state.playerId = sim.spawn({type: 'ship', isPlayer: true, team: 0,
    pos: {x: MORROW.anchor.x + 5000, z: MORROW.anchor.z}, radius: 4,
    hull: 100, hullMax: 100, mass: 12}).id;
  const system = sim.registry.get('morrow'); system.update(1 / 60, state);
  return {sim, state, system};
}

test('distant Morrow keeps one real body through native stepping and the canonical far-actor census', async () => {
  const {sim, state, system} = fixture();
  const physics = await createSg02DynamicBodyOwner({publishTelemetry: false});
  try {
    const body = system._entity(), id = body.id;
    const spec = resolvePhysicsBodySpec(body);
    assert.equal(spec.mass, MORROW.mass); assert.equal(spec.radius, MORROW.radius);
    for (let i = 0; i < 12; i++) {
      state.simTime = i * 2.1 + 1;
      body.activity = {simTier: SIM_TIER.S3_DORMANT};
      assert.equal(shouldVirtualizeFarActor(body, state), false);
      tickFarActors(state, sim.helpers, sim.bus);
      system.update(1 / 60, state);
      physics.syncFromEntities(state.entityList); physics.step(1 / 60);
      assert.equal(system._entity(), body); assert.equal(body.id, id);
      assert.equal(state.entityList.filter(e => e.alive && e.type === 'drone').length, 1);
      assert.equal(state.world.farActors.rows.length, 0, 'no anonymous shelved counterpart is owed');
      assert.ok(Number.isFinite(body.pos.x) && Number.isFinite(body.pos.z));
    }
  } finally {physics.dispose(); system.destroy(); sim.dispose();}
});

test('an owner-recognized older body and save restore gain the marker before distance demotion', () => {
  const {sim, state, system} = fixture();
  try {
    const body = system._entity(); delete body.data.authoredCharacter;
    body.activity = {simTier: SIM_TIER.S3_DORMANT};
    assert.equal(shouldVirtualizeFarActor(body, state), true, 'the old spec reproduces the missing custody');
    system._id = null; system._syncEntity();
    assert.equal(system._entity(), body); assert.equal(shouldVirtualizeFarActor(body, state), false);
    delete body.data.authoredCharacter;
    sim.bus.emit('save:restoring', {}); sim.bus.emit('save:loaded', {});
    assert.equal(system._entity(), body); assert.equal(shouldVirtualizeFarActor(body, state), false);
    tickFarActors(state, sim.helpers, sim.bus);
    assert.equal(state.world.farActors?.rows?.length || 0, 0);
  } finally {system.destroy(); sim.dispose();}
});
