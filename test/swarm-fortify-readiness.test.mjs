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
import { SWARM_FORTIFY_COMMAND, SWARM_FORTIFY_RECEIPT } from '../src/data/swarmFortify.js';

function fixture(deviceId) {
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
  function tick() {
    owner.update();
    sim.registry.get('physics').update(1 / 60, sim.state);
    sim.state.tick++; sim.state.simTime += 1 / 60;
  }
  function act() {
    const host = Object.assign(Object.create(input), {
      _keys: { KeyW: true }, _ndc: { x: 0, y: 0 }, _screen: { x: 0, y: 0, active: false },
      _m0: false, _m1: false, _m2: false, _lastKbmMs: 0,
      helpers: { raycastToPlane: () => ({ x: 100, z: 0 }) }, bus: sim.bus, gamepad: null, touch: null,
    });
    host.update(1 / 60, sim.state);
    assert.equal(swarmPilotHasActed(sim.state), true, 'ordinary thrust input starts the round');
  }
  return { sim, owner, structures, enemy, fires, tick, act };
}

for (const deviceId of ['kinetic_turret', 'tesla_pair']) {
  test(`${deviceId} saves its opening volley through protected waiting and fires on first act`, () => {
    const h = fixture(deviceId);
    try {
      const ammo = h.structures[0].data.swarmFortify.ammo;
      for (let i = 0; i < 1001; i++) h.tick();
      assert.equal(swarmPilotHasActed(h.sim.state), false);
      assert.equal(h.fires.length, 0, 'no wasted shots or false beam flashes into protected enemies');
      assert.equal(h.enemy.hull, 100);
      if (deviceId === 'kinetic_turret') assert.equal(h.structures[0].data.swarmFortify.ammo, ammo);
      h.act(); h.tick();
      assert.equal(h.fires.length, 1, 'first act fires immediately, not at the old idle cadence');
      if (deviceId === 'kinetic_turret') {
        assert.equal(h.structures[0].data.swarmFortify.ammo, ammo - 1);
        for (let i = 0; i < 25; i++) h.tick();
      }
      assert.ok(h.enemy.hull < 100, 'real projectile/Tesla damage lands after admission');
      assert.equal(h.fires.length, 1, 'ordinary interval remains respected');
    } finally { h.sim.dispose(); }
  });
}

test('a retained turret conserves its remaining magazine through the next wave opener', () => {
  const h = fixture('kinetic_turret');
  try {
    h.act(); h.tick();
    const turret = h.structures[0];
    assert.equal(turret.data.swarmFortify.ammo, 31);
    h.sim.state.run.phase = 'draft';
    h.sim.state.run.wave = 2;
    h.enemy.data.runWave = 2;
    h.sim.bus.emit('run:wavePlanned', { wave: 2 });
    h.sim.state.run.phase = 'active';
    for (let i = 0; i < 1001; i++) h.tick();
    assert.equal(h.fires.length, 1);
    assert.equal(turret.data.swarmFortify.ammo, 31);
    assert.equal(turret.alive, true, 'the same physical structure persists');
    h.act(); h.tick();
    assert.equal(h.fires.length, 2);
    assert.equal(turret.data.swarmFortify.ammo, 30);
  } finally { h.sim.dispose(); }
});
