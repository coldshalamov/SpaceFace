import test from 'node:test';
import assert from 'node:assert/strict';

// §22 E7 — a user-content weapon and module merge into the runtime catalogs, and the
// mod weapon fits and fires through the real weapons system. The data modules snapshot
// the payload at import-eval time, so the global must exist before these dynamic imports.
const MOD_WEAPON_ID = 'wpn_e7_mod_scatter';
const MOD_MODULE_ID = 'mod_e7_mod_hold';

globalThis.__SF_USER_MODS__ = {
  schema: 'spaceface.userContent.v1',
  mods: [{
    id: 'e7-test-rig',
    name: 'E7 Test Rig',
    version: '1.0.0',
    origin: 'local',
    content: {
      weapons: [{
        file: 'weapons/wpn_e7_mod_scatter.json',
        data: {
          id: MOD_WEAPON_ID,
          name: 'E7 Mod Scattergun',
          slotType: 'weapon',
          size: 'S',
          tier: 1,
          mass: 3,
          price: 3600,
          dmg: 4,
          rof: 6.0,
          damageType: 'kinetic',
          energyCost: 1.5,
          projSpeed: 360,
          range: 260,
          tracking: 'fixed',
        },
      }],
      modules: [{
        file: 'modules/mod_e7_mod_hold.json',
        data: {
          id: MOD_MODULE_ID,
          name: 'E7 Mod Hold',
          slotType: 'cargo',
          size: 'S',
          tier: 1,
          mass: 2,
          price: 2400,
          energyDraw: 0,
          mods: { cargoFlat: 24 },
        },
      }],
    },
  }],
};

const { WEAPONS } = await import('../src/data/weapons.js');
const { MODULES } = await import('../src/data/modules.js');
const { createGameState } = await import('../src/core/gameState.js');
const { createBus } = await import('../src/core/eventBus.js');
const { weapons } = await import('../src/systems/weapons.js');
const { hash32, mulberry32 } = await import('../src/core/rng.js');

test('E7 a user-content weapon and module merge into the runtime catalogs', () => {
  const w = WEAPONS.find((x) => x.id === MOD_WEAPON_ID);
  assert.ok(w, 'mod weapon record did not reach WEAPONS');
  assert.equal(w.name, 'E7 Mod Scattergun');
  const m = MODULES.find((x) => x.id === MOD_MODULE_ID);
  assert.ok(m, 'mod module record did not reach MODULES');
  assert.equal(m.mods.cargoFlat, 24);
});

test('E7 the mod weapon fits on the player and fires a projectile under its own id', () => {
  const state = createGameState(4242);
  state.settings.gameplay.controlScheme = 'pilot';
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  const player = { id: 1, type: 'ship', alive: true, flags: {}, team: 0, cap: 1000,
    radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: 1, data: { weapons: [{ defId: MOD_WEAPON_ID,
      gimbalArc: Math.PI / 12, facingAngle: 0, muzzleOffset: [0.8, 0.4],
      _cooldown: 0, _heat: 0 }] } };
  state.entities.set(1, player);
  state.entityList.push(player);
  state.playerId = 1;
  state.input.autoFire = false;
  state.input.fire = true;
  state.input.aimAngle = 0;
  const spawned = [];
  const bus = createBus();
  const helpers = { hash32, mulberry32, getEntity: (id) => state.entities.get(id),
    spawnEntity: (spec) => { const e = { id: 100 + spawned.length, alive: true, ...spec };
      spawned.push(e); return e; } };
  const system = Object.create(weapons);
  system.init({ state, bus, helpers });
  system.update(1 / 60, state);
  assert.ok(spawned.length >= 1, 'trigger down spawned no projectile');
  const shot = spawned.find((e) => e.type === 'projectile');
  assert.ok(shot, 'no projectile entity among spawns');
  assert.equal(shot.data.weaponId, MOD_WEAPON_ID);
});
