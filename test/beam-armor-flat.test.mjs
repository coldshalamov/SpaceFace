import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { packCombatTable } from '../src/core/combatTable.js';
import { weapons, BEAM_ARMOR_PACKET_S } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { normalizeDamagePacket, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { SIM_DT } from '../src/core/sim.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

// SF-2b #6: flat armor is deducted once per damage packet. A continuous beam emits one packet per
// tick (60 dps -> 1-damage packets at 60 Hz), so before this fix a target's armorFlat was paid 60
// times a second and flat 1-3 erased the beam (Beam Laser M: 1.9 dps on a Bruiser, 8 of 16 enemy
// types unkillable in 60 s). The beam now pays the flat once per BEAM_ARMOR_PACKET_S.

function bootWorld(seed = 9032, { production = false } = {}) {
  const state = createGameState(seed);
  // The production profile runs the forced heat vent; the process default (legacy 47-A) does not.
  if (production) state.runtime = Object.freeze({ ...(state.runtime || {}), profileId: 'production', features: PRODUCTION_FEATURES });
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

function shooter(env, weapon) {
  const ship = env.helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 6, mass: 12,
    hull: 400, hullMax: 400, cap: 4000, capMax: 4000, capRegen: 500,
    collides: true, team: 0, rot: 0,
    data: { weapons: [weapon] },
  });
  env.state.playerId = ship.id;
  ship.isPlayer = true;
  return ship;
}

function plated(env, armorFlat) {
  return env.helpers.spawnEntity({
    type: 'ship', pos: { x: 150, z: 0 }, radius: 7, mass: 12,
    hull: 5000, hullMax: 5000, armorFlat, cap: 1000, capMax: 1000,
    collides: true, team: 1, rot: 0, data: {},
  });
}

function tick(env) {
  packCombatTable(env.state);
  env.state.input.fire = true;
  env.state.input.aimAngle = 0;
  env.weaponsHost.update(SIM_DT, env.state);
  env.combatHost.update(SIM_DT, env.state);
  env.state.simTime += SIM_DT;
  env.state.tick += 1;
}

function beamHullDamage(armorFlat, ticks = 60) {
  const env = bootWorld();
  // heatPerSec 0 keeps the hold open for the whole second; the pipeline under test is unchanged.
  shooter(env, { defId: 'wpn_beam_laser_m', slotIndex: 0, heatPerSec: 0 });
  const target = plated(env, armorFlat);
  assert.equal(target.armorFlat, armorFlat, 'spawned with the authored flat armor');
  for (let i = 0; i < ticks; i++) tick(env);
  return target.hullMax - target.hull;
}

test('a held beam pays flat armor once per armor window, not once per tick', () => {
  assert.equal(BEAM_ARMOR_PACKET_S, 0.25);
  const bare = beamHullDamage(0);
  assert.ok(bare > 30, `beam cuts an unplated hull (${bare.toFixed(1)} in 1 s)`);
  for (const flat of [1, 3]) {
    const platedDamage = beamHullDamage(flat);
    // Flat f over 1 s of beam costs f x (1 / BEAM_ARMOR_PACKET_S) raw damage = 4f.
    const expected = bare * (1 - (flat / BEAM_ARMOR_PACKET_S) / 60);
    console.log(`[beam-armor-flat] flat ${flat}: ${platedDamage.toFixed(2)} vs bare ${bare.toFixed(2)} (expected ~${expected.toFixed(2)})`);
    assert.ok(platedDamage > bare * 0.75, `flat ${flat} must not erase the beam (${platedDamage.toFixed(2)} of ${bare.toFixed(2)})`);
    assert.ok(platedDamage < bare, `flat ${flat} still costs the beam something`);
    assert.ok(Math.abs(platedDamage - expected) < bare * 0.03, `flat ${flat}: ${platedDamage.toFixed(2)} ~ ${expected.toFixed(2)}`);
  }
});

test('beam packets carry their tick share of the window; other packets keep their shape', () => {
  const env = bootWorld();
  shooter(env, { defId: 'wpn_beam_laser_m', slotIndex: 0, heatPerSec: 0 });
  plated(env, 2);
  packCombatTable(env.state);
  env.state.input.fire = true;
  env.state.input.aimAngle = 0;
  env.weaponsHost.update(SIM_DT, env.state);
  const beam = env.state.combat.beams[0];
  assert.ok(beam && beam.damagePacket, 'the beam pushed its ray with a packet');
  assert.ok(Math.abs(beam.damagePacket.armorFlatScale - SIM_DT / BEAM_ARMOR_PACKET_S) < 1e-12);

  const shot = scalarHitToDamagePacket({ damage: 8, damageType: 'energy' });
  assert.equal('armorFlatScale' in shot, false, 'a projectile packet has no armorFlatScale');
  assert.equal('armorFlatScale' in normalizeDamagePacket(shot), false, 'normalizing keeps the projectile shape');
  assert.equal(normalizeDamagePacket({ ...shot, armorFlatScale: 0.5 }).armorFlatScale, 0.5);
  assert.equal(normalizeDamagePacket({ ...shot, armorFlatScale: 4 }).armorFlatScale, 1, 'clamped to a full packet');
});

test('a projectile hit still pays the full flat armor', () => {
  const dealt = (flat, extra = {}) => {
    const env = bootWorld();
    shooter(env, { defId: 'wpn_pulse_laser_s', slotIndex: 0 });
    const target = plated(env, flat);
    const damagePacket = { ...scalarHitToDamagePacket({ damage: 8, damageType: 'kinetic' }), ...extra };
    env.combatHost.onHit({ targetId: target.id, ownerId: env.state.playerId, damagePacket, pos: { x: 150, z: 0 } });
    return target.hullMax - target.hull;
  };
  const bare = dealt(0), platedDamage = dealt(3);
  assert.ok(bare > 0);
  // 8 raw - 3 flat: the shot loses well over a quarter of its damage, exactly as before.
  assert.ok(platedDamage < bare * 0.75, `flat 3 bites an 8-damage shot (${platedDamage} of ${bare})`);
  assert.equal(dealt(3, { armorFlatScale: 1 }), platedDamage, 'no scale == a full packet');
  assert.ok(dealt(3, { armorFlatScale: 0 }) > platedDamage, 'the scale is what the router reads');
});

// SF-2b #6 (heat): a beam clamps at heatMax, and the vent check in _tickWeapons runs after the next
// tick's dissipation, which always pulled it back under heatMax first. A beam never vented: Beam
// Laser M (55 heat/s against 25.3 dissipation) held full damage forever. It now trips the vent the
// tick it pegs, like the projectile paths.
test('a held beam pegs, vents every mount, then comes back (production profile)', () => {
  const env = bootWorld(9033, { production: true });
  const ship = shooter(env, { defId: 'wpn_beam_laser_m', slotIndex: 0 });
  plated(env, 0);
  const vents = [];
  env.bus.on('weapons:vent', (ev) => { if (ev.phase === 'start') vents.push(env.state.simTime); });
  let firedTicks = 0, firstVentTick = null, firedDuringVent = 0;
  const ticks = Math.round(10 / SIM_DT);
  for (let i = 0; i < ticks; i++) {
    const venting = env.state.simTime < (ship.data.weaponVentUntil || 0);
    tick(env);
    const fired = env.state.combat.beams.length > 0;
    if (fired) firedTicks++;
    if (fired && venting) firedDuringVent++;
    if (firstVentTick == null && vents.length) firstVentTick = i;
  }
  const duty = firedTicks / ticks;
  console.log(`[beam-vent] first vent at ${(firstVentTick * SIM_DT).toFixed(2)} s, vents ${vents.length} in 10 s, duty ${duty.toFixed(3)}`);
  assert.ok(firstVentTick != null, 'a held beam pegs heatMax and vents');
  assert.ok(firstVentTick * SIM_DT > 2.5 && firstVentTick * SIM_DT < 4.5, 'pegs after ~3.4 s of fire (100 / (55 - 25.3))');
  assert.equal(firedDuringVent, 0, 'no beam ray while the vent holds');
  assert.ok(vents.length >= 2, 'fires again after the vent and pegs again');
  assert.ok(duty > 0.6 && duty < 0.85, `sustained duty inside the 60-80 % band (${duty.toFixed(3)})`);
});

test('legacy 47-A profile keeps the vent off for beams too', () => {
  const env = bootWorld(9034);
  const ship = shooter(env, { defId: 'wpn_beam_laser_m', slotIndex: 0 });
  plated(env, 0);
  let firedTicks = 0;
  for (let i = 0; i < 300; i++) { tick(env); if (env.state.combat.beams.length) firedTicks++; }
  assert.equal(ship.data.weaponVentUntil || 0, 0);
  assert.equal(firedTicks, 300);
});
