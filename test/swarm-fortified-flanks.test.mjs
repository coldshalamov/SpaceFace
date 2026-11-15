import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { runSession } from '../src/systems/runSession.js';
import { fields } from '../src/systems/fields.js';
import { combat } from '../src/systems/combat.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { fortifiedArrivalCentre } from '../src/systems/swarmSafety.js';
import { swarmFortifySocket } from '../src/data/swarmFortify.js';

const plan = (seed, wave) => planWave({ seed, wave, arenaId: 'helios_core', ruleset: 'swarm' });

// A real run through the real owners: the paid device is bought over the bus, the pack is the
// Brood engine the arena really hosts.
function fixture(t, { seed = 4242, wave = 2, buy = [['kinetic_turret', 'front-near']] } = {}) {
  const sim = createSimulation({ seed, systems: [runSession, fields, combat, swarmFortify, swarmArena] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'custom';
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed, arenaId: 'helios_core' });
  state.run.phase = 'draft'; state.run.wave = 1; state.run.credits = 2000;
  const player = sim.spawn({ type: 'ship', team: 0, factionId: 'faction_player', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 20, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  bus.emit('run:wavePlanned', { wave: 1 });
  const owner = sim.registry.get('swarmFortify');
  let receipt; bus.on('swarm:fortifyBuildResolved', r => { receipt = r; });
  buy.forEach(([deviceId, socketId], i) => {
    bus.emit('swarm:fortifyBuildRequested', { requestId: i + 1, runToken: owner.getReadModel().runToken, deviceId, socketId });
    assert.equal(receipt.accepted, true, JSON.stringify(receipt));
  });
  state.run.phase = 'active'; state.run.wave = wave;
  const brood = sim.registry.get('swarmArena')._brood;
  brood.prepareWave(state.run, wave, plan(seed, wave));
  return { sim, state, owner, brood, player };
}

function packs(brood) {
  const b = brood._bodies, rows = [];
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) rows.push({ x: b.px[i], z: b.pz[i], life: b.serial[i] });
  return rows;
}

test('a paid turret is met: the whole opening pack arrives beyond it, on its own approach', t => {
  const h = fixture(t);
  const socket = swarmFortifySocket('front-near');
  const turret = h.state.entityList.find(e => e.data?.swarmFortify?.deviceId === 'kinetic_turret');
  const anchor = h.owner.getArenaAnchor();
  const turretFar = Math.hypot(turret.pos.x - anchor.x, turret.pos.z - anchor.z);
  assert.equal(Math.round(turretFar), socket.distance);
  assert.ok(h.brood.spawnWave(h.state) > 0);
  const rows = packs(h.brood);
  assert.ok(rows.length >= 18, 'a real round-two pack, not a handful');
  for (const body of rows) {
    const far = Math.hypot(body.x - anchor.x, body.z - anchor.z);
    assert.ok(far > turretFar + turret.radius, `body at ${far.toFixed(0)} wu is past the turret (${turretFar})`);
    const cos = ((body.x - anchor.x) * (turret.pos.x - anchor.x) + (body.z - anchor.z) * (turret.pos.z - anchor.z)) / (far * turretFar);
    assert.ok(cos > 0.9, 'on the turret\'s bearing, so it faces the hardware');
    assert.ok(Math.hypot(body.x - turret.pos.x, body.z - turret.pos.z) > turret.radius + 20, 'never inside its footprint');
  }
});

test('packs prefer defended approaches and skip an empty corridor', t => {
  const h = fixture(t, { buy: [['kinetic_turret', 'front-near'], ['kinetic_turret', 'port-far']] });
  const anchor = h.owner.getArenaAnchor();
  const guards = h.owner.getArrivalGuards();
  assert.deepEqual(guards.guards.map(g => g.corridor).sort(), ['diagonal_a', 'front']);
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const c = fortifiedArrivalCentre(guards, i);
    const ang = Math.round(Math.atan2(c.z - anchor.z, c.x - anchor.x) / (Math.PI / 2));
    seen.add(ang);
    assert.ok(Math.hypot(c.x - anchor.x, c.z - anchor.z) > 370 + 12);
  }
  assert.equal(seen.size, 2, 'two defended approaches, never the starboard one');
  h.brood.spawnWave(h.state);
  for (const body of packs(h.brood)) assert.ok(Math.hypot(body.x - anchor.x, body.z - anchor.z) > 300);
});

test('no paid field: the pack arrives exactly as before, around the pilot', t => {
  const h = fixture(t, { buy: [] });
  assert.equal(h.owner.getArrivalGuards(), null);
  h.brood.spawnWave(h.state);
  const rows = packs(h.brood);
  assert.ok(rows.length >= 18);
  for (const body of rows) assert.ok(Math.hypot(body.x - h.player.pos.x, body.z - h.player.pos.z) < 230);
});

test('endless rounds past thirty keep the ordinary ring even with a paid field', t => {
  const h = fixture(t, { wave: 31 });
  h.brood.spawnWave(h.state);
  for (const body of packs(h.brood)) assert.ok(Math.hypot(body.x - h.player.pos.x, body.z - h.player.pos.z) < 230);
});

test('a destroyed defence stops drawing the pack; same seed, same round', t => {
  const a = fixture(t), b = fixture(t);
  a.brood.spawnWave(a.state); b.brood.spawnWave(b.state);
  assert.deepEqual(packs(a.brood), packs(b.brood));
  const dead = fixture(t);
  const turret = dead.state.entityList.find(e => e.data?.swarmFortify);
  turret.hull = 0; turret.alive = false;
  dead.sim.helpers.removeEntity(turret.id, { immediate: true, reason: 'combat_killed' }); dead.sim.bus.flush();
  assert.equal(dead.owner.getArrivalGuards(), null);
});
