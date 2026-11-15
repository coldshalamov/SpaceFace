import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { runSession } from '../src/systems/runSession.js';
import { fields } from '../src/systems/fields.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { physics } from '../src/core/physics.js';
import { input } from '../src/systems/input.js';
import { swarmPilotHasActed } from '../src/systems/swarmSafety.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { fortifyReadiness } from '../src/ui/swarmFortifyPanel.js';
import { SWARM_FORTIFY_COMMAND, SWARM_FORTIFY_RECEIPT } from '../src/data/swarmFortify.js';

function openingFixture(deviceId) {
  const state = createGameState(1818);
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1818 }),
    { phase: 'draft', wave: 1, credits: 500 });
  state.settings.gameplay.physicsBackend = 'custom';
  const sim = createSimulation({ seed: 1818, state, systems: [runSession, fields, swarmFortify, weapons, combat, physics] });
  sim.state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 20,
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' } });
  sim.state.playerId = player.id;
  sim.bus.emit('run:wavePlanned', { wave: 1 });
  const owner = sim.registry.get('swarmFortify');
  const receipts = [], fires = [];
  sim.bus.on(SWARM_FORTIFY_RECEIPT, p => receipts.push(p));
  sim.bus.on('combat:fire', p => { if (p.fortifyDeviceId) fires.push(p); });
  sim.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken: owner.getReadModel().runToken,
    deviceId, socketId: 'front-near' });
  assert.equal(receipts.at(-1).accepted, true, 'actual paid construction accepted');
  const structures = sim.state.entityList.filter(e => e.data?.swarmFortify?.deviceId === deviceId);
  const first = structures[0];
  const targetPos = deviceId === 'tesla_pair'
    ? { x: (first.pos.x + structures[1].pos.x) / 2, z: (first.pos.z + structures[1].pos.z) / 2 }
    : { x: first.pos.x + 120, z: first.pos.z };
  const enemy = sim.spawn({ type: 'ship', team: 1, factionId: 'faction_brood', pos: targetPos,
    vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 24, hull: 100, hullMax: 100,
    armorHp: 0, shield: 0, collides: true, data: { runCohort: 'survival', runWave: 1,
      combatProfileId: 'combat_profile_standard_ship', ai: { forcePlayerTarget: true } } });
  sim.state.run.phase = 'active';
  const tick = () => {
    owner.update();
    sim.registry.get('physics').update(1 / 60, sim.state);
    sim.state.tick++; sim.state.simTime += 1 / 60;
  };
  const act = () => {
    const host = Object.assign(Object.create(input), {
      _keys: { KeyW: true }, _ndc: { x: 0, y: 0 }, _screen: { x: 0, y: 0, active: false },
      _m0: false, _m1: false, _m2: false, _lastKbmMs: 0,
      helpers: { raycastToPlane: () => ({ x: 100, z: 0 }) }, bus: sim.bus, gamepad: null, touch: null,
    });
    host.update(1 / 60, sim.state);
    assert.equal(swarmPilotHasActed(sim.state), true, 'ordinary thrust input starts the round');
  };
  return { sim, owner, structures, enemy, fires, tick, act };
}

for (const deviceId of ['kinetic_turret', 'tesla_pair']) {
  test(`${deviceId} holds its opening volley through the protected wait and fires on the first act`, () => {
    const h = openingFixture(deviceId);
    try {
      const ammo = h.structures[0].data.swarmFortify.ammo;
      for (let i = 0; i < 1001; i++) h.tick();
      assert.equal(swarmPilotHasActed(h.sim.state), false);
      assert.equal(h.fires.length, 0, 'no paid shot or beam flash into protected arrivals');
      assert.equal(h.enemy.hull, 100);
      if (deviceId === 'kinetic_turret') assert.equal(h.structures[0].data.swarmFortify.ammo, ammo);
      h.act(); h.tick();
      assert.equal(h.fires.length, 1, 'the first act fires at once, not at the old idle cadence');
      if (deviceId === 'kinetic_turret') {
        assert.equal(h.structures[0].data.swarmFortify.ammo, ammo - 1);
        for (let i = 0; i < 25; i++) h.tick();
      }
      assert.ok(h.enemy.hull < 100, 'real projectile/Tesla damage lands after admission');
      assert.equal(h.fires.length, 1, 'the ordinary interval is still respected');
    } finally { h.sim.dispose(); }
  });
}

function lossFixture(t, deviceId = 'kinetic_turret') {
  const sim = createSimulation({ seed: 4242, systems: [runSession, fields, combat, swarmFortify] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'custom';
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  state.run.phase = 'draft'; state.run.wave = 1; state.run.credits = 1000;
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_player', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 20, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  bus.emit('run:wavePlanned', { wave: 1 });
  const owner = sim.registry.get('swarmFortify');
  let receipt; bus.on('swarm:fortifyBuildResolved', r => { receipt = r; });
  const build = id => {
    bus.emit('swarm:fortifyBuildRequested', { requestId: id, runToken: owner.getReadModel().runToken, deviceId, socketId: 'front-near' });
    return receipt;
  };
  assert.equal(build(1).accepted, true);
  state.run.phase = 'active'; state.run.wave = 2;
  const entities = receipt.structureIds.map(id => state.entities.get(id));
  const kill = entity => {
    entity.hull = 0; entity.alive = false;
    sim.helpers.removeEntity(entity.id, { immediate: true, reason: 'combat_killed' }); bus.flush();
  };
  return { sim, state, bus, owner, entities, build, kill };
}

test('a device destroyed in the round reaches the wire and the screen read as one loss, not a repairable phantom', t => {
  const h = lossFixture(t), wallet = h.state.run.credits;
  h.kill(h.entities[0]);
  h.state.run.phase = 'draft';
  let view; h.bus.on('swarm:fortifyState', x => { view = x; });
  h.bus.emit('swarm:fortifyStateRequested', { requestId: 'fortify-read' });
  assert.deepEqual(view.structures, []);
  assert.deepEqual(view.lostDevices, [{ deviceId: 'kinetic_turret', socketId: 'front-near', wave: 2 }]);
  const wire = projectBridgeEvent('swarm:fortifyState', view);
  assert.equal(wire.dropped, false);
  const read = fortifyReadiness(wire.flat);
  assert.equal(read.ready, 'No defenses in place.');
  assert.equal(read.lost, 'Lost last round · Kinetic Turret at Front · inner');
  assert.equal(h.state.run.credits, wallet, 'nothing was refunded or charged');
});

test('a standing device reads as in place, and as needing service once its rounds are spent', t => {
  const h = lossFixture(t);
  h.state.run.phase = 'draft';
  let model = h.owner.getReadModel();
  assert.equal(fortifyReadiness(model).ready, 'In place · Kinetic Turret · all ready');
  assert.equal(fortifyReadiness(model).lost, null);
  h.entities[0].data.swarmFortify.ammo = 5;
  model = h.owner.getReadModel();
  assert.equal(fortifyReadiness(model).ready, 'In place · Kinetic Turret · 1 needs service');
});

test('a lost socket clears only after a paid replacement, and expires in the next round', t => {
  const h = lossFixture(t);
  h.kill(h.entities[0]); h.state.run.phase = 'draft';
  const purse = h.state.run.credits; h.state.run.credits = 0;
  assert.equal(h.build(2).accepted, false);
  assert.equal(h.owner.getReadModel().lostDevices.length, 1, 'a refused rebuild keeps the record');
  h.state.run.credits = purse;
  assert.equal(h.build(3).accepted, true);
  assert.deepEqual(h.owner.getReadModel().lostDevices, []);
  h.state.run.phase = 'active';
  h.kill(h.state.entityList.find(e => e.alive && e.data?.swarmFortify));
  assert.equal(h.owner.getReadModel().lostDevices.length, 1);
  h.state.run.wave = 3;
  assert.deepEqual(h.owner.getReadModel().lostDevices, [], 'last round only');
});

test('a Tesla pair stays serviceable after one endpoint falls and is lost only when both are gone', t => {
  const h = lossFixture(t, 'tesla_pair');
  h.kill(h.entities[0]); h.state.run.phase = 'draft';
  let model = h.owner.getReadModel();
  assert.equal(model.structures[0].missingEndpoint, true);
  assert.deepEqual(model.lostDevices, []);
  assert.match(fortifyReadiness(model).ready, /1 needs service/);
  h.state.run.phase = 'active'; h.kill(h.entities[1]); h.state.run.phase = 'draft';
  model = h.owner.getReadModel();
  assert.equal(model.structures.length, 0);
  assert.equal(model.lostDevices.length, 1);
});

test('stale destruction receipts and administrative removal cannot invent a loss', t => {
  const h = lossFixture(t), original = h.entities[0];
  h.bus.emit('entity:destroyed', { id: original.id, entity: { ...original, hull: 0 } });
  assert.equal(h.owner.getReadModel().structures.length, 1);
  assert.deepEqual(h.owner.getReadModel().lostDevices, []);
  h.sim.helpers.removeEntity(original.id, { immediate: true, reason: 'administrative' }); h.bus.flush();
  assert.deepEqual(h.owner.getReadModel().lostDevices, []);
});
