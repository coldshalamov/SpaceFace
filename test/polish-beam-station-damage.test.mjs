import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { packCombatTable } from '../src/core/combatTable.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { SIM_DT } from '../src/core/sim.js';

// Beam candidates must see stations. The combat table packs only ship/projectile/wreck lanes,
// and the beam owner's own row keeps the table query non-empty, so the fast path used to strand
// the only lane that could return a station — a beam crossed a station without ever scratching
// it. packCombatTable runs in core's preStep every production tick; the harness calls it for the
// same reason, so the beam sweep exercises the packed-table fast path, not the no-table fallback
// lane that (returning the whole damageables list) always saw stations on its own.
// Everything here runs the production seams: weapons pushes the real state.combat.beams ray,
// combat's _applyBeamDamage arbitrates first-body-on-the-ray.

const SEED = 9031;

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

function beamShip(env, x = 0, z = 0) {
  // beam_laser_m is the authored continuous energy mount; instance heatPerSec:0 keeps the
  // hold open for the whole test window without touching the pipeline under test.
  const ship = env.helpers.spawnEntity({
    type: 'ship', pos: { x, z }, radius: 6, mass: 12,
    hull: 400, hullMax: 400, cap: 4000, capMax: 4000, capRegen: 500,
    collides: true, team: 0, rot: 0,
    data: { weapons: [{ defId: 'wpn_beam_laser_m', slotIndex: 0, heatPerSec: 0 }] },
  });
  env.state.playerId = ship.id;
  ship.isPlayer = true;
  return ship;
}

function beamStation(env, x, z) {
  // Same vital shape the world spawner gives stations (hull pool only, no shield/armor).
  return env.helpers.spawnEntity({
    type: 'station', pos: { x, z }, radius: 40, mass: 1e6,
    hull: 5000, hullMax: 5000, collides: true, team: 1,
    data: { stationId: 'station_polish_beam_target', name: 'Beam Target Station' },
  });
}

function beamRaider(env, x, z) {
  return env.helpers.spawnEntity({
    type: 'ship', pos: { x, z }, radius: 7, mass: 12,
    hull: 300, hullMax: 300, cap: 1000, capMax: 1000,
    collides: true, team: 1, rot: 0, data: {},
  });
}

function packLikePreStep(env) {
  packCombatTable(env.state);
  // The fast path is the condition under test: without packed rows this harness would only
  // exercise the no-table fallback lane, which never hid stations in the first place.
  assert.ok(env.state.combatTable && env.state.combatTable.count > 0,
    'combat table packed with ship-lane rows');
}

function beamTick(env, firing = true) {
  env.state.input.fire = firing;
  env.state.input.aimAngle = 0;
  env.weaponsHost.update(SIM_DT, env.state);
  env.combatHost.update(SIM_DT, env.state);
  env.state.simTime += SIM_DT;
  env.state.tick += 1;
}

test('a beam whose ray crosses a station damages it', () => {
  const env = bootWorld();
  beamShip(env);
  const target = beamStation(env, 200, 0);
  packLikePreStep(env);
  const damageEvents = [];
  env.bus.on('combat:damage', (p) => damageEvents.push(p));

  beamTick(env, true);

  assert.ok(target.hull < target.hullMax, `station hull dropped (hull=${target.hull}/${target.hullMax})`);
  assert.ok(damageEvents.some((d) => d.targetId === target.id && d.hullDamage > 0),
    'combat:damage fired for the station');
});

test('a beam held on a station keeps cutting it', () => {
  const env = bootWorld();
  beamShip(env);
  const target = beamStation(env, 200, 0);
  packLikePreStep(env);

  beamTick(env, true);
  const firstHull = target.hull;
  for (let i = 0; i < 9; i++) beamTick(env, true);

  assert.ok(firstHull < target.hullMax, 'the first tick landed');
  assert.ok(target.hull < firstHull, `held beam kept cutting (hull=${target.hull} < ${firstHull})`);
});

test('a beam still damages a ship on the same ray — the station scan changes nothing', () => {
  const env = bootWorld();
  beamShip(env);
  const raider = beamRaider(env, 180, 0);
  packLikePreStep(env);

  beamTick(env, true);

  assert.ok(raider.hull < raider.hullMax, `ship hull dropped (hull=${raider.hull}/${raider.hullMax})`);
});

test('a beam stops at a ship before a station behind it (first-body-on-the-ray order holds)', () => {
  const env = bootWorld();
  beamShip(env);
  const raider = beamRaider(env, 120, 0);
  const target = beamStation(env, 200, 0);
  packLikePreStep(env);

  beamTick(env, true);

  assert.ok(raider.hull < raider.hullMax, 'the ship ahead takes the contact');
  assert.equal(target.hull, target.hullMax, 'the station behind is shielded by the nearer hull');
});
