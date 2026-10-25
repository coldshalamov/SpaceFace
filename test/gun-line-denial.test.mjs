// Packet 02: "blocked" at the point of intent is read from the SAME queries the shot obeys — the shared
// line-of-sight witness for bodies and the shield-pylon intercept for panels — through the real
// SG-02 physics authority and sim (no mocks). The owner's own wall never blocks the owner's shots.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { shieldPylons } from '../src/systems/shieldPylons.js';
import { PYLON_MODULE_ID, SHIELD_PYLON_DEF as DEF, PYLON_STATES as S } from '../src/data/shieldPylons.js';
import { pylonMirror } from '../src/combat/pylonShieldQuery.js';
import { DENIAL, gunLineDenial } from '../src/combat/contactClassifier.js';

const COOLDOWN_TICKS = Math.ceil(DEF.deployCooldownS / SIM_DT) + 3;

async function boot() {
  const sim = createSimulation({ seed: 6162, bus: createBus(), systems: [shieldPylons, physics, combat] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.player.credits = 5000;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSys = sim.registry.get('physics');
  assert.equal(await physicsSys.prepareBackend(state), true);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: -200 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 500, hullMax: 500, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', fittings: [PYLON_MODULE_ID] },
  });
  state.playerId = player.id;
  const t = { sim, state, player, physicsSys };
  t.cleanup = () => { if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority(); };
  return t;
}
const steps = (t, n) => { for (let i = 0; i < n; i++) t.sim.step(); };
function press(t, aim) {
  t.state.input.aimWorld = { x: aim.x, z: aim.z };
  t.state.input.actions.deployShieldPylon = true;
  t.sim.step();
}
function placeWall(t, x = 100) {
  t.player.pos.x = 0; t.player.pos.z = 0;
  press(t, { x, z: -60 });
  steps(t, COOLDOWN_TICKS);
  press(t, { x, z: 60 });
  steps(t, Math.ceil(DEF.linkS / SIM_DT) + 8);
  const pair = pylonMirror(t.state).pairs.find((p) => p.panel && Math.abs(p.panel.ax - x) < 1e-6);
  assert.ok(pair && pair.state === S.ACTIVE, 'the wall is up');
  return pair;
}
const hull = (t, x, z, { team = 1, radius = 10 } = {}) => t.sim.spawn({
  type: 'ship', team, pos: { x, z }, radius, collides: true, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  hull: 200, hullMax: 200, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, flightModel: { inertia: 40 }, flags: {},
  physicsBody: { schemaVersion: 1, radius, mass: 14, inertiaY: 40, dynamic: true, ccd: true, material: 'ship', revision: 0 },
  data: { combatProfileId: 'combat_profile_standard_ship', ...(team === 1 ? { encounter: true } : {}) },
});
const rock = (t, x, z, radius = 30) => t.sim.spawn({
  type: 'asteroid', team: 0, pos: { x, z }, radius, collides: true, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
  hull: 9999, hullMax: 9999, flags: {}, mass: 9999,
  physicsBody: { schemaVersion: 1, radius, mass: 9999, inertiaY: 9999, dynamic: false, ccd: false, material: 'rock', revision: 0 },
  data: {},
});

test('a rock on the line blocks it; clear space and the target\'s own body do not', async () => {
  const t = await boot();
  try {
    t.player.pos.x = 0; t.player.pos.z = 0;
    const foe = hull(t, 300, 0);
    steps(t, 2);
    assert.equal(gunLineDenial(t.state, t.player, foe), null, 'open line: nothing to say');
    rock(t, 150, 0);
    steps(t, 2);
    const verdict = gunLineDenial(t.state, t.player, foe);
    assert.ok(verdict, 'the rock blocks the line');
    assert.equal(verdict.reason, DENIAL.BLOCKED);
    assert.equal(verdict.by, 'body');
    foe.pos.z = 400; // step the target out from behind it
    steps(t, 2);
    assert.equal(gunLineDenial(t.state, t.player, foe), null, 'clear again once the target is off the rock\'s shadow');
  } finally { t.cleanup(); }
});

test('shield panel: the owner\'s own wall never blocks the owner\'s shots; a panel hostile to the shooter does', async () => {
  const t = await boot();
  try {
    const pair = placeWall(t, 100);
    t.player.pos.x = 20; t.player.pos.z = 0;
    const behind = hull(t, 220, 0);
    steps(t, 2);
    assert.equal(gunLineDenial(t.state, t.player, behind), null, 'the owner shoots through its own wall');
    // The same wall, owned by an enemy: from the player\'s side it is a hostile wall.
    const enemy = hull(t, 400, -300);
    pair.ownerId = enemy.id;
    steps(t, 1);
    const verdict = gunLineDenial(t.state, t.player, behind);
    assert.ok(verdict, 'a wall raised against the player stops the player\'s round');
    assert.equal(verdict.by, 'shield-panel');
    assert.equal(verdict.reason, DENIAL.BLOCKED);
    // shooting AT a pylon endpoint is never blocked by its own panel
    assert.equal(gunLineDenial(t.state, t.player, t.state.entities.get(pair.a.id)), null);
  } finally { t.cleanup(); }
});
