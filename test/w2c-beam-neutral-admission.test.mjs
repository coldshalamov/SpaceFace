// W2-C / O14: a continuous beam admits the same targets a bolt does. The sweep used to skip every
// same-team hull before intersection, so a player beam passed straight through a neutral team-0
// civilian or station that a bolt hits (law handles the consequence). The damage authority's
// friendly-fire rule now decides for both; the shooter's own devices stay protected.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { packCombatTable } from '../src/core/combatTable.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { SIM_DT } from '../src/core/sim.js';

const SEED = 9032;

function bootWorld(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  core.init(ctx);
  const weaponsHost = Object.create(weapons);
  weaponsHost.init(ctx);
  const combatHost = Object.create(combat);
  combatHost.init(ctx);
  return { state, bus, helpers, weaponsHost, combatHost };
}

function beamShip(env) {
  const ship = env.helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 6, mass: 12,
    hull: 400, hullMax: 400, cap: 4000, capMax: 4000, capRegen: 500,
    collides: true, team: 0, rot: 0,
    data: { weapons: [{ defId: 'wpn_beam_laser_m', slotIndex: 0, heatPerSec: 0 }] },
  });
  env.state.playerId = ship.id;
  ship.isPlayer = true;
  return ship;
}

function target(env, x, extra = {}) {
  return env.helpers.spawnEntity({
    type: 'ship', pos: { x, z: 0 }, radius: 7, mass: 12,
    hull: 300, hullMax: 300, cap: 1000, capMax: 1000,
    collides: true, rot: 0, data: {}, ...extra,
  });
}

function beamTick(env) {
  packCombatTable(env.state);
  env.state.input.fire = true;
  env.state.input.aimAngle = 0;
  env.weaponsHost.update(SIM_DT, env.state);
  env.combatHost.update(SIM_DT, env.state);
  env.state.simTime += SIM_DT;
  env.state.tick += 1;
}

test('a player beam hits a neutral team-0 civilian the way a bolt does', () => {
  const env = bootWorld();
  beamShip(env);
  const civilian = target(env, 180, { team: 0, factionId: 'faction_civilian' });

  // The bolt path: the damage router's verdict on the identical shooter/target pair.
  const bolt = env.combatHost.onHit({
    targetId: civilian.id, ownerId: env.state.playerId, damage: 5, damageType: 'energy',
    pos: { x: civilian.pos.x, z: civilian.pos.z }, weaponId: 'wpn_pulse_laser_s',
  });
  assert.equal(bolt.ok, true, 'a bolt is admitted onto the neutral civilian');
  const afterBolt = civilian.hull;

  beamTick(env);
  assert.ok(civilian.hull < afterBolt, `the beam cut the same neutral civilian (hull=${civilian.hull}/${afterBolt})`);
});

test('a player beam hits a neutral team-0 station', () => {
  const env = bootWorld();
  beamShip(env);
  const station = env.helpers.spawnEntity({
    type: 'station', pos: { x: 200, z: 0 }, radius: 40, mass: 1e6,
    hull: 5000, hullMax: 5000, collides: true, team: 0,
    data: { stationId: 'station_w2c_neutral', name: 'Neutral Station' },
  });
  beamTick(env);
  assert.ok(station.hull < station.hullMax, `neutral station took the beam (hull=${station.hull})`);
});

test('the shooter\'s own device (player faction) is still protected and does not block the ray', () => {
  const env = bootWorld();
  beamShip(env);
  const device = target(env, 100, { team: 0, factionId: 'faction_player', type: 'drone' });
  const raider = target(env, 220, { team: 1 });
  beamTick(env);
  assert.equal(device.hull, device.hullMax, 'the owned device takes no beam damage');
  assert.ok(raider.hull < raider.hullMax, 'the ray continues past the protected device to the raider');
});

test('a device owned by the shooter is protected', () => {
  const env = bootWorld();
  const player = beamShip(env);
  const device = target(env, 100, { team: 0, type: 'drone', ownerId: player.id });
  const raider = target(env, 220, { team: 1 });
  beamTick(env);
  assert.equal(device.hull, device.hullMax);
  assert.ok(raider.hull < raider.hullMax);
});

test('NPC beams keep the same-team pass-through unless the damage authority admits the hit', () => {
  const env = bootWorld();
  beamShip(env);
  const gunner = target(env, 0, { team: 1, pos: { x: 500, z: 0 }, data: { ai: { lawful: true } } });
  const ally = target(env, 0, { team: 1, pos: { x: 600, z: 0 }, data: { ai: { lawful: true } } });
  const beam = {
    ownerId: gunner.id, weaponId: 'wpn_beam_laser_m', dmgType: 'energy', dpsThisTick: 40,
    from: { x: gunner.pos.x, z: gunner.pos.z }, to: { x: 900, z: 0 },
    damagePacket: null,
  };
  env.state.combat.beams = [beam];
  env.combatHost._applyBeamDamage(env.state);
  assert.equal(ally.hull, ally.hullMax, 'lawful same-team ally is not cut by a teammate beam');
});
