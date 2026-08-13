import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { planHullRolePath } from '../src/data/shipRoleLattice.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
  ships,
} from '../src/systems/ships.js';
import { weapons } from '../src/systems/weapons.js';

const TARGETING_COMPUTER = 'mod_targeting_computer_m';
const HEAVY_BEAM = WEAPONS.find((weapon) => weapon.id === 'wpn_heavy_beam_l');
const SIEGE_LANCE = WEAPONS.find((weapon) => weapon.id === 'wpn_siege_lance_l');
const TORPEDO = WEAPONS.find((weapon) => weapon.id === 'wpn_torpedo_l');
const STARTER = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s');

assert.ok(HEAVY_BEAM && SIEGE_LANCE && TORPEDO && STARTER, 'targeting test catalog weapons exist');

function bastionFittings(moduleIds = []) {
  return fittingsFromDefaultModules('ship_bastion', [
    HEAVY_BEAM.id,
    SIEGE_LANCE.id,
    ...moduleIds,
  ]);
}

function weaponFor(spec, defId) {
  const weapon = spec.data.weapons.find((entry) => entry.defId === defId);
  assert.ok(weapon, `${defId} resolves into the runtime battery`);
  return weapon;
}

test('Targeting Computer derives additive finite bonuses from compatible utility fits only', () => {
  const base = getDerivedStats('ship_bastion', bastionFittings());
  const fitted = getDerivedStats('ship_bastion', bastionFittings([TARGETING_COMPUTER]));
  const doubled = getDerivedStats('ship_bastion', bastionFittings([TARGETING_COMPUTER, TARGETING_COMPUTER]));
  const incompatible = getDerivedStats('ship_kestrel', [TARGETING_COMPUTER]);

  assert.deepEqual(
    {
      weaponRangePct: base.weaponRangePct,
      weaponDmgPct: base.weaponDmgPct,
      weaponRangeMult: base.weaponRangeMult,
      weaponDmgMult: base.weaponDmgMult,
    },
    { weaponRangePct: 0, weaponDmgPct: 0, weaponRangeMult: 1, weaponDmgMult: 1 },
  );
  assert.deepEqual(
    {
      weaponRangePct: fitted.weaponRangePct,
      weaponDmgPct: fitted.weaponDmgPct,
      weaponRangeMult: fitted.weaponRangeMult,
      weaponDmgMult: fitted.weaponDmgMult,
    },
    { weaponRangePct: 0.15, weaponDmgPct: 0.08, weaponRangeMult: 1.15, weaponDmgMult: 1.08 },
  );
  assert.deepEqual(
    {
      weaponRangePct: doubled.weaponRangePct,
      weaponDmgPct: doubled.weaponDmgPct,
    },
    { weaponRangePct: 0.30, weaponDmgPct: 0.16 },
    'ordinary percentage modifiers add deterministically when valid duplicate fittings exist',
  );
  assert.equal(incompatible.weaponRangePct, 0, 'a manual incompatible-slot module cannot grant range');
  assert.equal(incompatible.weaponDmgPct, 0, 'a manual incompatible-slot module cannot grant damage');
});

test('Targeting Computer fails closed for malformed or negative catalog modifiers', () => {
  const targeting = MODULES.find((module) => module.id === TARGETING_COMPUTER);
  assert.ok(targeting, 'Targeting Computer exists in the module catalog');
  const original = { ...targeting.mods };
  const fit = bastionFittings([TARGETING_COMPUTER]);
  try {
    for (const modifiers of [
      { weaponRangePct: Infinity, weaponDmgPct: -0.08 },
      { weaponRangePct: '0.15', weaponDmgPct: true },
    ]) {
      targeting.mods.weaponRangePct = modifiers.weaponRangePct;
      targeting.mods.weaponDmgPct = modifiers.weaponDmgPct;
      const derived = getDerivedStats('ship_bastion', fit);
      assert.equal(derived.weaponRangePct, 0);
      assert.equal(derived.weaponDmgPct, 0);
      assert.equal(derived.weaponRangeMult, 1);
      assert.equal(derived.weaponDmgMult, 1);
    }
  } finally {
    Object.assign(targeting.mods, original);
  }
});

test('initial player and non-player role-lattice specs rebuild scaled weapon runtimes from catalog bases', () => {
  const fit = bastionFittings([TARGETING_COMPUTER]);
  const baseSpec = makeShipEntitySpec('ship_bastion', { isPlayer: true, fittings: bastionFittings() });
  const playerSpec = makeShipEntitySpec('ship_bastion', { isPlayer: true, fittings: fit });
  const npcSpec = makeShipEntitySpec('ship_bastion', { isPlayer: false, fittings: fit });
  const rolePath = planHullRolePath('ship_bastion');
  const roleFit = fittingsFromDefaultModules('ship_bastion', rolePath.items.flatMap((item) => (
    Array.from({ length: item.count }, () => item.defId)
  )));
  const roleNpc = makeShipEntitySpec('ship_bastion', { isPlayer: false, fittings: roleFit });

  assert.equal(weaponFor(baseSpec, HEAVY_BEAM.id).range, HEAVY_BEAM.range);
  assert.equal(weaponFor(baseSpec, HEAVY_BEAM.id).dmg, HEAVY_BEAM.dmg);
  assert.equal(weaponFor(playerSpec, HEAVY_BEAM.id).range, HEAVY_BEAM.range * 1.15);
  assert.equal(weaponFor(playerSpec, HEAVY_BEAM.id).dmg, HEAVY_BEAM.dmg * 1.08);
  assert.equal(weaponFor(playerSpec, SIEGE_LANCE.id).range, SIEGE_LANCE.range * 1.15);
  assert.equal(weaponFor(playerSpec, SIEGE_LANCE.id).dmg, SIEGE_LANCE.dmg * 1.08);
  assert.equal(weaponFor(npcSpec, HEAVY_BEAM.id).range, HEAVY_BEAM.range * 1.15);
  assert.equal(weaponFor(roleNpc, HEAVY_BEAM.id).dmg, HEAVY_BEAM.dmg * 1.08,
    'the authored Bastion role-lattice fit reaches the non-player runtime path');
  assert.equal(HEAVY_BEAM.range, 900, 'runtime derivation never mutates the immutable weapon catalog');
  assert.equal(HEAVY_BEAM.dmg, 160, 'runtime derivation never mutates the immutable weapon catalog');
});

test('Targeting Computer scales the fallback starter and does not compound across recompute or unfit', () => {
  const fallbackFit = fittingsFromDefaultModules('ship_drifter', [TARGETING_COMPUTER]);
  const fallbackSpec = makeShipEntitySpec('ship_drifter', { isPlayer: true, fittings: fallbackFit });
  assert.equal(weaponFor(fallbackSpec, STARTER.id).range, STARTER.range * 1.15);
  assert.equal(weaponFor(fallbackSpec, STARTER.id).dmg, STARTER.dmg * 1.08);

  const state = createGameState(84);
  state.mode = 'flight';
  state.player.ownedShips = [{ defId: 'ship_bastion', fittings: bastionFittings([TARGETING_COMPUTER]) }];
  state.player.activeShipIndex = 0;
  state.player.cargo = { items: {}, usedMass: 0, usedVolume: 0, capMass: 0, capVolume: 0 };
  const entity = makeEntity(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    player: state.player,
    fittings: state.player.ownedShips[0].fittings,
  }));
  entity.id = 1;
  state.playerId = entity.id;
  state.entities = new Map([[entity.id, entity]]);
  const runtime = Object.create(ships);
  runtime.init({ state, bus: createBus(), helpers: { getEntity: (id) => state.entities.get(id) || null } });

  const twice = runtime.recomputeEntity(entity.id, state.player.ownedShips[0].fittings);
  assert.equal(weaponFor(entity, HEAVY_BEAM.id).range, HEAVY_BEAM.range * 1.15);
  assert.equal(weaponFor(entity, HEAVY_BEAM.id).dmg, HEAVY_BEAM.dmg * 1.08);
  assert.equal(twice.weaponRangeMult, 1.15, 'second derivation reads raw fitted data, not prior runtime values');

  const unfit = bastionFittings();
  const bare = runtime.recomputeEntity(entity.id, unfit);
  assert.equal(bare.weaponRangeMult, 1);
  assert.equal(weaponFor(entity, HEAVY_BEAM.id).range, HEAVY_BEAM.range);
  assert.equal(weaponFor(entity, HEAVY_BEAM.id).dmg, HEAVY_BEAM.dmg);
});

test('scaled runtime values drive both projectile and beam fire paths', () => {
  const state = createGameState(85);
  state.mode = 'flight';
  state.input.fire = true;
  state.input.aimAngle = 0;
  state.combat = { beams: [] };
  const entity = makeEntity(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    fittings: fittingsFromDefaultModules('ship_bastion', [
      HEAVY_BEAM.id,
      SIEGE_LANCE.id,
      TORPEDO.id,
      TARGETING_COMPUTER,
    ]),
  }));
  entity.id = 1;
  state.playerId = entity.id;
  state.entities = new Map([[entity.id, entity]]);
  state.entityList = [entity];
  state.entityIndex = { ships: [entity], weaponShips: [entity] };
  const spawned = [];
  const runtime = Object.create(weapons);
  runtime.init({
    state,
    bus: createBus(),
    helpers: {
      getEntity: (id) => state.entities.get(id) || null,
      spawnEntity: (spec) => { spawned.push(spec); return spec; },
      hash32: () => 1,
      mulberry32: () => () => 0.5,
    },
  });
  runtime.update(1 / 60, state);

  const beam = state.combat.beams.find((entry) => entry.weaponId === HEAVY_BEAM.id);
  const projectile = spawned.find((entry) => entry.type === 'projectile' && entry.data.weaponId === SIEGE_LANCE.id);
  const torpedo = weaponFor(entity, TORPEDO.id);
  const bareTorpedo = weaponFor(makeShipEntitySpec('ship_bastion', {
    isPlayer: true,
    fittings: fittingsFromDefaultModules('ship_bastion', [TORPEDO.id]),
  }), TORPEDO.id);
  runtime._spawnProjectile(entity, torpedo, TORPEDO, 0, null, true, state);
  const torpedoProjectile = spawned.find((entry) => (
    entry.type === 'projectile' && entry.data.weaponId === TORPEDO.id
  ));
  assert.ok(beam, 'the real continuous weapon path emitted a beam ray');
  assert.ok(projectile, 'the real projectile weapon path spawned a projectile');
  assert.ok(torpedoProjectile, 'the real projectile path spawned the scaled torpedo payload');
  assert.equal(Math.hypot(beam.to.x - beam.from.x, beam.to.z - beam.from.z), HEAVY_BEAM.range * 1.15);
  assert.equal(beam.dpsThisTick, HEAVY_BEAM.dmg * 1.08 / 60);
  assert.equal(projectile.data.maxDistance, SIEGE_LANCE.range * 1.15);
  assert.equal(projectile.data.damage, SIEGE_LANCE.dmg * 1.08);
  assert.equal(torpedo.splashDmg, TORPEDO.splashDmg * 1.08);
  assert.equal(torpedoProjectile.data.splashDmg, TORPEDO.splashDmg * 1.08);
  assert.equal(bareTorpedo.splashDmg, TORPEDO.splashDmg);
  assert.equal(TORPEDO.splashDmg, 120, 'runtime derivation never mutates the raw torpedo definition');
});
