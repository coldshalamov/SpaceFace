import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import {
  fittedModuleDefs,
  fittedModuleIds,
  hasFittedModule,
  maxFittedModuleMod,
  sumFittedModuleMod,
} from '../src/core/fittedModules.js';
import {
  CHOIR_BELL_KNOCKBACK_SPEED,
  KNITBOTS_OOC_DELAY_S,
  KNITBOTS_REPAIR_RATE,
  NESTBREAKER_DIVERGENCE_RAD,
  NESTBREAKER_SUBMUNITION_DAMAGE,
  PALE_COIL_BLINK_DISTANCE,
  TIDELINE_MAGNET_ACCEL,
  TIDELINE_MAGNET_RANGE,
  UNIQUE_LOOT_ABILITY_STATE_VERSION,
  fittedUniqueEnergyPremium,
  uniqueLootAbilities,
} from '../src/systems/uniqueLootAbilities.js';

function fittingState(fittings, inventory = []) {
  const player = {
    id: 7,
    data: { fittings: fittings.slice() },
  };
  return {
    playerId: player.id,
    player: { moduleInventory: inventory.slice() },
    entities: new Map([[player.id, player]]),
  };
}

test('fitted module selectors read only the live player entity fittings', () => {
  const state = fittingState(
    ['unique_pale_coil_warp_drive', 'unique_nestbreaker_rack', null, 'unique_knitbots'],
    [{ defId: 'unique_choir_bell_aegis' }, { defId: 'wpn_missile_rack_m' }],
  );
  const before = structuredClone(state.entities.get(state.playerId).data.fittings);

  assert.deepEqual(fittedModuleIds(state), [
    'unique_pale_coil_warp_drive',
    'unique_nestbreaker_rack',
    'unique_knitbots',
  ]);
  assert.deepEqual(
    fittedModuleDefs(state).map((entry) => entry.id),
    ['unique_pale_coil_warp_drive', 'unique_nestbreaker_rack', 'unique_knitbots'],
  );
  assert.equal(hasFittedModule(state, 'unique_pale_coil_warp_drive'), true);
  assert.equal(hasFittedModule(state, 'unique_nestbreaker_rack'), true,
    'valid fitted weapon ids share the same equipment selector');
  assert.equal(hasFittedModule(state, 'wpn_missile_rack_m'), false,
    'an inventory-only weapon is not fitted equipment');
  assert.equal(hasFittedModule(state, 'unique_choir_bell_aegis'), false,
    'inventory ownership is not equipment');
  assert.equal(maxFittedModuleMod(state, 'hullRepairOOC'), 4.4);
  assert.equal(sumFittedModuleMod(state, 'hullRepairOOC'), 4.4);
  assert.deepEqual(state.entities.get(state.playerId).data.fittings, before,
    'selectors never mutate the live fitting array');
});

test('fitted module selectors fail closed for missing or stale player entities', () => {
  const missing = { playerId: 3, player: { moduleInventory: [{ defId: 'unique_knitbots' }] }, entities: new Map() };
  assert.deepEqual(fittedModuleIds(missing), []);
  assert.deepEqual(fittedModuleDefs(missing), []);
  assert.equal(hasFittedModule(missing, 'unique_knitbots'), false);
  assert.equal(maxFittedModuleMod(missing, 'hullRepairOOC', 9), 9);
  assert.equal(sumFittedModuleMod(missing, 'hullRepairOOC'), 0);
});

function bootAbilities(fittings = [], inventory = []) {
  const sim = createSimulation({ seed: 47022, systems: [uniqueLootAbilities] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.moduleInventory = inventory.map((entry, index) => (
    typeof entry === 'string' ? { instanceId: `inventory:${index}`, defId: entry } : { ...entry }
  ));
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    mass: 20,
    hull: 100,
    hullMax: 100,
    cap: 100,
    capMax: 100,
    data: { fittings: fittings.slice(), defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  return {
    sim,
    state,
    bus,
    player,
    system: sim.registry.get('uniqueLootAbilities'),
    dispose: () => sim.dispose(),
  };
}

function closeTo(actual, expected, message, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, received ${actual}`);
}

function spawnEncounterShip(t, encounterId, pos = { x: 900, z: 0 }) {
  return t.sim.spawn({
    type: 'ship', team: 1, pos, vel: { x: 0, z: 0 }, radius: 8, mass: 16,
    data: { ai: { encounterId } },
  });
}

function spawnMissile(t, owner, {
  pos = { x: 300, z: 0 },
  vel = { x: -120, z: 0 },
  targetId = t.player.id,
} = {}) {
  return t.sim.spawn({
    type: 'projectile',
    team: owner.team,
    ownerId: owner.id,
    pos,
    vel,
    rot: Math.atan2(vel.z, vel.x),
    radius: 0.7,
    mass: 0.1,
    ttl: 10,
    data: {
      kind: 'missile',
      ownerId: owner.id,
      targetId,
      weaponId: 'wpn_missile_rack_m',
      damage: 70,
      damageType: 'explosive',
      turnRate: 3.5,
      projSpeed: 320,
    },
  });
}

function spawnNestbreakerShot(t) {
  return t.sim.spawn({
    type: 'projectile',
    team: t.player.team,
    ownerId: t.player.id,
    pos: { x: 20, z: -5 },
    vel: { x: 320, z: 0 },
    rot: 0,
    radius: 0.7,
    mass: 0.1,
    ttl: 2.8125,
    collides: true,
    data: {
      kind: 'missile',
      ownerId: t.player.id,
      targetId: 991,
      weaponId: 'unique_nestbreaker_rack',
      damage: 49,
      damageType: 'explosive',
      turnRate: 3.5,
      projSpeed: 320,
      projAccel: 140,
      armed: true,
      splashRadius: 40,
      splashDmg: 24.5,
      spawnPos: { x: 20, z: -5 },
      maxDistance: 900,
    },
  });
}

function packetDamage(packet) {
  return Object.values(packet?.channels || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

test('Pale-Coil blinks forward in global_v1 exactly once per encounter and survives save restore', () => {
  const t = bootAbilities(['unique_pale_coil_warp_drive']);
  try {
    t.player.pos.set(10, 0, 20);
    t.player.vel.set(17, 0, -9);
    t.player.rot = Math.PI / 3;
    t.bus.emit('encounter:spawned', { encounterId: 'enc:pale' });

    const velocityBefore = { x: t.player.vel.x, z: t.player.vel.z };
    t.bus.emit('ship:dash', { shipId: t.player.id, impulse: 1800 });
    closeTo(t.player.pos.x, 10 + Math.cos(Math.PI / 3) * PALE_COIL_BLINK_DISTANCE, 'blink x');
    closeTo(t.player.pos.z, 20 + Math.sin(Math.PI / 3) * PALE_COIL_BLINK_DISTANCE, 'blink z');
    assert.deepEqual({ x: t.player.vel.x, z: t.player.vel.z }, velocityBefore,
      'the blink preserves existing velocity');
    assert.equal(t.player.flags.noInterp, true, 'the physics owner is told to resync the teleported pose');

    const afterFirst = { x: t.player.pos.x, z: t.player.pos.z };
    t.bus.emit('ship:dash', { shipId: t.player.id, impulse: 1800 });
    assert.deepEqual({ x: t.player.pos.x, z: t.player.pos.z }, afterFirst,
      'a second dash in the same encounter cannot blink');

    const saved = t.system.serialize();
    assert.equal(saved.schemaVersion, UNIQUE_LOOT_ABILITY_STATE_VERSION);
    assert.equal(saved.encounters['enc:pale'].paleCoilUsed, true);

    const restored = bootAbilities(['unique_pale_coil_warp_drive']);
    try {
      restored.system.deserialize(saved);
      restored.bus.emit('encounter:spawned', { encounterId: 'enc:pale' });
      restored.bus.emit('ship:dash', { shipId: restored.player.id });
      assert.deepEqual({ x: restored.player.pos.x, z: restored.player.pos.z }, { x: 0, z: 0 },
        'loading cannot refund the encounter use');

      restored.bus.emit('encounter:resolved', { encounterId: 'enc:pale' });
      restored.bus.emit('encounter:spawned', { encounterId: 'enc:next' });
      restored.bus.emit('ship:dash', { shipId: restored.player.id });
      closeTo(restored.player.pos.x, PALE_COIL_BLINK_DISTANCE, 'a new encounter grants one new blink');
    } finally {
      restored.dispose();
    }
  } finally {
    t.dispose();
  }
});

test('Pale-Coil inventory ownership never activates the fitted-only blink', () => {
  const t = bootAbilities([], ['unique_pale_coil_warp_drive']);
  try {
    t.bus.emit('encounter:spawned', { encounterId: 'enc:inventory' });
    t.bus.emit('ship:dash', { shipId: t.player.id });
    assert.deepEqual({ x: t.player.pos.x, z: t.player.pos.z }, { x: 0, z: 0 });
  } finally {
    t.dispose();
  }
});

test('Choir-Bell ignores outbound ordnance then deflects only the first inbound missile per encounter', () => {
  const t = bootAbilities(['unique_choir_bell_aegis']);
  try {
    const encounterId = 'enc:bell';
    t.bus.emit('encounter:spawned', { encounterId });
    const owner = spawnEncounterShip(t, encounterId);
    const outbound = spawnMissile(t, owner, { vel: { x: 120, z: 0 } });
    t.sim.step(1 / 60);
    assert.equal(outbound.data.targetId, t.player.id, 'outbound missiles do not consume the pulse');
    assert.equal(consumePhysicsCommand(outbound), null);

    const firstInbound = spawnMissile(t, owner);
    t.sim.step(1 / 60);
    const firstCommand = consumePhysicsCommand(firstInbound);
    assert.equal(firstInbound.data.targetId, null, 'deflected missiles lose their player lock');
    assert.equal(firstInbound.data.turnRate, 0, 'deflected missiles cannot reacquire through homing');
    assert.equal(firstInbound.data.choirBellDeflected, true);
    assert.equal(firstCommand?.impulses.length, 1, 'knockback crosses the physics command membrane');
    closeTo(firstCommand.impulses[0].x,
      (CHOIR_BELL_KNOCKBACK_SPEED - (-120)) * firstInbound.mass,
      'the pulse queues the exact outward delta-v');

    const secondInbound = spawnMissile(t, owner, { pos: { x: 280, z: 20 } });
    t.sim.step(1 / 60);
    assert.equal(secondInbound.data.targetId, t.player.id, 'the same encounter gets no second pulse');
    assert.equal(consumePhysicsCommand(secondInbound), null);

    const saved = t.system.serialize();
    assert.equal(saved.encounters[encounterId].choirBellUsed, true);
    const restored = bootAbilities(['unique_choir_bell_aegis']);
    try {
      restored.system.deserialize(saved);
      restored.bus.emit('encounter:spawned', { encounterId });
      const restoredOwner = spawnEncounterShip(restored, encounterId);
      const reloadedMissile = spawnMissile(restored, restoredOwner);
      restored.sim.step(1 / 60);
      assert.equal(reloadedMissile.data.targetId, restored.player.id,
        'save/load cannot refund the reactive pulse');
      assert.equal(consumePhysicsCommand(reloadedMissile), null);
    } finally {
      restored.dispose();
    }
  } finally {
    t.dispose();
  }
});

test('Choir-Bell inventory ownership cannot deflect a live missile', () => {
  const t = bootAbilities([], ['unique_choir_bell_aegis']);
  try {
    const encounterId = 'enc:inventory-bell';
    t.bus.emit('encounter:spawned', { encounterId });
    const missile = spawnMissile(t, spawnEncounterShip(t, encounterId));
    t.sim.step(1 / 60);
    assert.equal(missile.data.targetId, t.player.id);
    assert.equal(consumePhysicsCommand(missile), null);
  } finally {
    t.dispose();
  }
});

test('Nestbreaker turns one authored launch into exactly two real deterministic 49-damage projectiles', () => {
  const run = () => {
    const t = bootAbilities(['unique_nestbreaker_rack']);
    try {
      const spawned = [];
      t.bus.on('entity:spawned', ({ entity }) => {
        if (entity?.type === 'projectile') spawned.push(entity);
      });
      const original = spawnNestbreakerShot(t);
      const projectiles = t.state.entityList.filter((entry) => entry.type === 'projectile');
      assert.equal(projectiles.length, 2, 'one authored shot has exactly two world entities');
      assert.equal(spawned.length, 2, 'both submunitions travel through entity:spawned');
      assert.equal(new Set(projectiles.map((entry) => entry.id)).size, 2);
      assert.deepEqual(projectiles.map((entry) => entry.data.nestbreakerSubmunition).sort(), [1, 2]);
      for (const projectile of projectiles) {
        assert.equal(projectile.data.damage, NESTBREAKER_SUBMUNITION_DAMAGE);
        closeTo(packetDamage(projectile.data.damagePacket), NESTBREAKER_SUBMUNITION_DAMAGE,
          'damage packet remains canonical');
        assert.equal(projectile.data.damagePacket.hit, null,
          'the eventual collision supplies hit position; spawn-time divergence is not a fake hit');
      }

      const byIndex = projectiles.slice().sort(
        (a, b) => a.data.nestbreakerSubmunition - b.data.nestbreakerSubmunition,
      );
      closeTo(Math.atan2(byIndex[0].vel.z, byIndex[0].vel.x), -NESTBREAKER_DIVERGENCE_RAD,
        'first submunition divergence');
      closeTo(Math.atan2(byIndex[1].vel.z, byIndex[1].vel.x), NESTBREAKER_DIVERGENCE_RAD,
        'second submunition divergence');
      closeTo(Math.hypot(byIndex[0].vel.x, byIndex[0].vel.z), 320, 'first speed');
      closeTo(Math.hypot(byIndex[1].vel.x, byIndex[1].vel.z), 320, 'second speed');

      t.bus.emit('entity:spawned', { id: original.id, type: original.type, entity: original });
      assert.equal(t.state.entityList.filter((entry) => entry.type === 'projectile').length, 2,
        'the recursion marker also makes duplicate spawn notifications idempotent');
      return byIndex.map((entry) => ({
        x: entry.pos.x, z: entry.pos.z, vx: entry.vel.x, vz: entry.vel.z,
        damage: entry.data.damage, marker: entry.data.nestbreakerSubmunition,
      }));
    } finally {
      t.dispose();
    }
  };

  assert.deepEqual(run(), run(), 'split geometry is deterministic across identical runs');
});

test('Nestbreaker inventory ownership leaves a unique-rack projectile unsplit', () => {
  const t = bootAbilities([], ['unique_nestbreaker_rack']);
  try {
    const original = spawnNestbreakerShot(t);
    assert.equal(t.state.entityList.filter((entry) => entry.type === 'projectile').length, 1);
    assert.equal(original.data.nestbreakerSubmunition, undefined);
  } finally {
    t.dispose();
  }
});

test('Tideline tractors only explicitly small ordinary wrecks (ore pickups owned by mining scoop)', () => {
  // After magnet-range wiring, fitted Tideline scoop (derived.magnetRange) owns ordinary ore
  // pickups. Unique Tideline impulses are wreck-only so the two systems do not double-force.
  const t = bootAbilities(['unique_tideline_tractor']);
  try {
    const pickup = t.sim.spawn({
      type: 'pickup', pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 }, radius: 1.3, mass: 0.1,
    });
    const boundaryPickup = t.sim.spawn({
      type: 'pickup', pos: { x: TIDELINE_MAGNET_RANGE, z: 0 }, vel: { x: 0, z: 0 }, radius: 1.3, mass: 0.1,
    });
    const smallOrdinary = t.sim.spawn({
      type: 'wreck', pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 9, mass: 100,
      data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 2 } },
    });
    const uniqueSmall = t.sim.spawn({
      type: 'wreck', pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 7, mass: 100,
      data: { parentType: 'ship', salvagePool: {}, uniqueWreckId: 'wreck_choir_tender' },
    });
    const largeOrdinary = t.sim.spawn({
      type: 'wreck', pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 100,
      data: { parentType: 'ship', salvagePool: { cmdty_scrap_metal: 2 } },
    });

    t.sim.step(0.5);
    assert.equal(consumePhysicsCommand(pickup), null,
      'ordinary pickups are not double-impulsed by unique Tideline');
    assert.equal(consumePhysicsCommand(boundaryPickup), null,
      'ordinary pickups are not double-impulsed at the unique range boundary');
    const wreckCommand = consumePhysicsCommand(smallOrdinary);
    closeTo(wreckCommand.impulses[0].x, -TIDELINE_MAGNET_ACCEL * smallOrdinary.mass * 0.5,
      'whole-wreck pull uses the physics seam');
    assert.equal(consumePhysicsCommand(uniqueSmall), null, 'unique wrecks are never dragged whole');
    assert.equal(consumePhysicsCommand(largeOrdinary), null, 'large wrecks are never dragged whole');
  } finally {
    t.dispose();
  }
});

test('Tideline inventory ownership does not queue tractor impulses', () => {
  const t = bootAbilities([], ['unique_tideline_tractor']);
  try {
    const pickup = t.sim.spawn({
      type: 'pickup', pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 }, radius: 1.3, mass: 0.1,
    });
    t.sim.step(0.5);
    assert.equal(consumePhysicsCommand(pickup), null);
  } finally {
    t.dispose();
  }
});

test('Knitbots repair the player hull at exactly 4.4 per second only after the OOC delay', () => {
  const t = bootAbilities(['unique_knitbots']);
  try {
    t.player.hull = 50;
    t.player.lastDamageT = 0;
    t.state.simTime = KNITBOTS_OOC_DELAY_S + 1;
    t.state.automation = { groups: [{ id: 'not-a-docked-drone-model', hull: 2, hullMax: 10 }] };
    const automationBefore = structuredClone(t.state.automation);
    t.sim.step(0.5);
    closeTo(t.player.hull, 50 + KNITBOTS_REPAIR_RATE * 0.5, 'Knitbots hull repair');
    assert.deepEqual(t.state.automation, automationBefore,
      'the ability does not fabricate repair semantics for automation records');

    t.player.hull = 60;
    t.player.lastDamageT = t.state.simTime;
    t.sim.step(KNITBOTS_OOC_DELAY_S - 0.1);
    assert.equal(t.player.hull, 60, 'recent combat suppresses repair');

    t.player.hull = 99;
    t.player.lastDamageT = -1e9;
    t.sim.step(0.5);
    assert.equal(t.player.hull, 100, 'repair caps at hullMax');
  } finally {
    t.dispose();
  }
});

test('Knitbots inventory ownership does not repair the live player entity', () => {
  const t = bootAbilities([], ['unique_knitbots']);
  try {
    t.player.hull = 50;
    t.player.lastDamageT = -1e9;
    t.sim.step(1);
    assert.equal(t.player.hull, 50);
  } finally {
    t.dispose();
  }
});

test('only fitted unique variant premiums drain capacitor at exact per-second rates', () => {
  const t = bootAbilities([
    'unique_choir_bell_aegis',
    'unique_tideline_tractor',
    'unique_deepsurvey_suite',
  ]);
  try {
    assert.equal(fittedUniqueEnergyPremium(t.state), 9, '4.5 + 3 + 1.5 unique premiums');
    t.player.cap = 100;
    t.sim.step(2);
    assert.equal(t.player.cap, 82);

    t.player.cap = 2;
    t.sim.step(1);
    assert.equal(t.player.cap, 0, 'premium drain never makes capacitor negative');
  } finally {
    t.dispose();
  }

  const ordinary = bootAbilities(['mod_shield_aegis_l', 'mod_tractor_beam_m', 'mod_survey_suite']);
  try {
    ordinary.player.cap = 100;
    ordinary.sim.step(2);
    assert.equal(fittedUniqueEnergyPremium(ordinary.state), 0);
    assert.equal(ordinary.player.cap, 100, 'base energy draw is not retroactively activated');
  } finally {
    ordinary.dispose();
  }

  const inventoryOnly = bootAbilities([], [
    'unique_choir_bell_aegis',
    'unique_tideline_tractor',
    'unique_deepsurvey_suite',
  ]);
  try {
    inventoryOnly.player.cap = 100;
    inventoryOnly.sim.step(2);
    assert.equal(fittedUniqueEnergyPremium(inventoryOnly.state), 0);
    assert.equal(inventoryOnly.player.cap, 100);
  } finally {
    inventoryOnly.dispose();
  }
});

test('unique loot ability runtime contains no nondeterministic random source', () => {
  const source = readFileSync(new URL('../src/systems/uniqueLootAbilities.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(source, /Date\.now\s*\(/);
});
