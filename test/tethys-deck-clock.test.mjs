import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { partitionUpdateSystems, updateQueueForThisStep } from '../src/core/catchupPolicy.js';
import { queuePhysicsImpulse, writePhysicsBodyResponse, consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { kesslerDeckDamping } from '../src/systems/kesslerDeckDamping.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { PRODUCTION_UPDATE_ORDER, PRODUCTION_INIT_ORDER, getSystemClock,
  validateSystemClockDeclarations, validateSystemModeDeclarations } from '../src/runtime/authoritativeSystemManifest.js';

const DT = 1 / 60;
function scene() {
  const pod = { id: 1, occupantGeneration: 1, type: 'payload', alive: true, hull: 100,
    hullMax: 100, collides: true, radius: 3, mass: 20, pos: kesslerPadPosition(),
    vel: { x: 5, z: 0 }, rot: 0, angVel: 0, data: { jettisonedCargo: true },
    physicsBody: { schemaVersion: 1, dynamic: true, ccd: true, shape: 'ball',
      radius: 3, mass: 20, inertiaY: 90, revision: 0 } };
  const beacon = { id: 2, alive: true, physicsBody: false,
    data: { kesslerScale: true, kesslerWorksiteVersion: 1 } };
  const state = { tick: 1, runtime: { profileId: 'production' }, simCatchupIndex: 0,
    mode: 'flight', run: { kind: 'adventure' }, ui: {}, player: { flags: {} },
    world: { currentSectorId: 'sector_tethys_junction' },
    entities: new Map([[1, pod], [2, beacon]]), entityList: [pod, beacon],
    combat: { entities: { 1: { physicsResponse: { massScale: 1 } } } } };
  return { pod, state };
}

test('deck has its own table clock directly before physics; cargo and plate keep their clocks', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('kesslerDeckDamping'));
  assert.equal(PRODUCTION_UPDATE_ORDER.indexOf('kesslerDeckDamping') + 1,
    PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  assert.equal(getSystemClock('kesslerDeckDamping'), 'table');
  assert.equal(getSystemClock('cargo'), 'near');
  assert.equal(getSystemClock('kesslerScale'), 'calendar');
  assert.deepEqual(validateSystemClockDeclarations(), []);
  assert.deepEqual(validateSystemModeDeclarations(), []);
});

// Focused native fixture: field/status input is scripted, but clock partitioning,
// deck impulses and the Rapier solve are the production owners, not Euler math.
async function run(batch, transitions = false) {
  const native = await createSg02DynamicBodyOwner();
  const { pod, state } = scene(), snapshots = [], calls = { cargo: 0, deck: 0 };
  const systems = [
    { name: 'fields', update(dt) {
      const scale = transitions ? [6, 1, 8, .25, 1, .25, 8][(state.tick - 1) % 7] : 1;
      state.combat.entities[1].physicsResponse.massScale = scale;
      writePhysicsBodyResponse(pod, { massScale: scale });
      if (!transitions) queuePhysicsImpulse(pod, { x: 44 * 20 * scale * dt, z: -41 * 20 * scale * dt });
    } },
    { name: 'cargo', update() { calls.cargo++; } },
    { ...kesslerDeckDamping, update(dt, s) { calls.deck++; kesslerDeckDamping.update(dt, s); } },
    { name: 'physics', update(dt) { native.syncFromEntities([pod]); native.step(dt, state.tick); } },
  ].sort((a, b) => PRODUCTION_UPDATE_ORDER.indexOf(a.name) - PRODUCTION_UPDATE_ORDER.indexOf(b.name));
  const partitions = partitionUpdateSystems(systems);
  try {
    for (let i = 0; i < 108; i++) {
      state.tick = i + 1; state.simCatchupIndex = i % batch;
      const before = Math.hypot(pod.vel.x, pod.vel.z);
      for (const system of updateQueueForThisStep(partitions, state)) system.update(DT, state);
      const speed = Math.hypot(pod.vel.x, pod.vel.z);
      if (transitions) {
        assert.ok(pod.vel.x >= 0, 'current response never reverses drag');
        assert.ok(speed <= before + 1e-7, 'current response never adds kinetic energy');
        assert.equal(consumePhysicsCommand(pod), null, 'no previous-step drag remains queued');
      } else if (i > 12) assert.ok(speed < 8, 'deck stays readable under continuous Anvil-scale pull');
      snapshots.push([pod.pos.x, pod.pos.z, pod.vel.x, pod.vel.z]);
    }
    assert.equal(calls.deck, 108);
    assert.equal(calls.cargo, Math.ceil(108 / batch));
    return snapshots;
  } finally { native.dispose(); }
}

test('native deck motion is identical for one through four fixed steps per frame', async () => {
  const expected = await run(1);
  for (const batch of [2, 3, 4]) assert.deepEqual(await run(batch), expected);
});

test('native response changes use same-step mass, not stale post-physics impulses', async () => {
  const expected = await run(1, true);
  assert.ok(Math.abs(expected[0][2] - 3) < 1e-6);
  assert.ok(Math.abs(expected[1][2] - 1.8) < 1e-6);
  assert.deepEqual(await run(4, true), expected);
});

test('scheduler and local gates keep deck inert outside the flight worksite', () => {
  for (const change of [s => { s.mode = 'swarm'; }, s => { s.mode = 'docked'; },
    s => { s.mode = 'shipbreakingYard'; }, s => { s.mode = 'unknown'; },
    s => { s.mode = 'menu'; }, s => { s.mode = 'paused'; },
    s => { s.run = { kind: 'survival', phase: 'active' }; },
    s => { s.ui.docked = true; }, s => { s.physicsVenue = { active: true }; },
    s => { s.world.currentSectorId = 'sector_ceres_belt'; }]) {
    const { state, pod } = scene(); change(state);
    const partitions = partitionUpdateSystems([kesslerDeckDamping]);
    for (const system of updateQueueForThisStep(partitions, state)) system.update(DT, state);
    assert.equal(consumePhysicsCommand(pod), null);
  }
});
