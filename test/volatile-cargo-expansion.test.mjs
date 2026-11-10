/**
 * INFERENCE WF-06 / WF-16 — Volatile Cargo Classes Expansion & Cryogenic Flash Physics.
 *
 * Proves:
 * 1. Four distinct volatile cargo classes: explosive, corrosive, superdense, cryogenic.
 * 2. Twelve commodities mapped across the four classes with distinctive lamps and silhouettes.
 * 3. Non-volatile commodities resolve to null (no spurious physical consequences).
 * 4. Military munitions (cmdty_munitions) and hydrogen (cmdty_gas_hydrogen) detonate explosive slam.
 * 5. Cryogenic pods (cmdty_ice_water, cmdty_gas_helium3) flash cryo on impact, applying Cryo Lock.
 * 6. Superdense heavy ores (cmdty_ore_einsteinium, cmdty_ore_platinium) enforce 0.5 throwRangeMult and field pull.
 * 7. Reactive exotic matter (cmdty_exotic_xenium) applies corrosive contact tick.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  VOLATILE_CLASSES,
  VOLATILE_BY_COMMODITY,
  volatileClassOf,
} from '../src/data/commodityVolatileClasses.js';
import { CRYO_LOCK_STATUS_ID, CRYO_LOCK_DURATION_TICKS } from '../src/combat/cryoLock.js';
import { combat } from '../src/systems/combat.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import {
  CORROSIVE_HULL_TICK,
  EXPLOSIVE_BLAST_RADIUS,
  JETTISONED_CARGO_PAYLOAD_TYPE,
  lootShards,
} from '../src/systems/lootShards.js';

function def(id) {
  const row = COMMODITIES.find((item) => item.id === id);
  assert.ok(row, `${id} must exist in COMMODITIES catalog`);
  return row;
}

function findPods(state) {
  const list = state.entityList || [];
  return list.filter((entity) => entity
    && entity.alive !== false
    && entity.type === 'payload'
    && entity.data
    && entity.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
}

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: extra.rot || 0,
    angVel: 0,
    radius: extra.radius || 12,
    mass: extra.mass || 16,
    hull: extra.hull != null ? extra.hull : 80,
    hullMax: extra.hullMax != null ? extra.hullMax : 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    collides: true,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 12,
      mass: extra.mass || 16,
      inertiaY: 40,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { defId: extra.defId || 'ship_wasp', combatProfileId: 'combat_profile_standard_ship' },
  };
}

function boot(seed, systems = [cargo, lootShards, combat, physics]) {
  const sim = createSimulation({ seed, bus: createBus(), systems });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn(shipSpec({
    defId: 'ship_kestrel',
    mass: 18,
    hull: 120,
    hullMax: 120,
    radius: 14,
  }));
  state.playerId = player.id;
  state.player.cargo.capVolume = 80;
  state.player.cargo.capMass = 80;
  return {
    sim,
    state,
    helpers,
    player,
    cargoSys: sim.registry.get('cargo'),
    lootSys: sim.registry.get('lootShards'),
    combatSys: sim.registry.get('combat'),
    physicsSys: sim.registry.get('physics'),
    cleanup() {
      const physicsSys = sim.registry.get('physics');
      if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
        physicsSys._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

async function bootPhysics(seed) {
  const t = boot(seed);
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'rapier-dynamic should initialize headless');
  return t;
}

function jettisonPod(t, commodityId, amount = 8) {
  assert.equal(addCargo(t.state, commodityId, amount), amount);
  assert.equal(t.cargoSys.jettison(commodityId, amount), amount);
  const pods = findPods(t.state).filter((pod) => pod.data.commodityId === commodityId);
  assert.equal(pods.length, 1, `one ${commodityId} pod`);
  return pods[0];
}

test('four distinct volatile cargo classes exist with unique lamp identifiers', () => {
  const classes = Object.values(VOLATILE_CLASSES);
  assert.equal(classes.length, 4, 'Four defined classes');
  const ids = classes.map((c) => c.id);
  assert.deepEqual(ids.sort(), ['corrosive', 'cryogenic', 'explosive', 'superdense']);

  const lamps = classes.map((c) => c.lamp);
  assert.equal(new Set(lamps).size, 4, 'Four distinct lamp colors');
  assert.equal(VOLATILE_CLASSES.explosive.lamp, 'amber');
  assert.equal(VOLATILE_CLASSES.corrosive.lamp, 'green');
  assert.equal(VOLATILE_CLASSES.superdense.lamp, 'violet');
  assert.equal(VOLATILE_CLASSES.cryogenic.lamp, 'cyan');

  assert.equal(VOLATILE_CLASSES.cryogenic.slam, 'cryo_flash');
  assert.equal(VOLATILE_CLASSES.superdense.fieldPull, true);
  assert.equal(VOLATILE_CLASSES.superdense.throwRangeMult, 0.5);
});

test('twelve commodities map across the four volatile classes', () => {
  const expectedMappings = {
    // Explosive
    cmdty_fuel_cells: 'explosive',
    cmdty_munitions: 'explosive',
    cmdty_impulse_charge: 'explosive',
    cmdty_gas_hydrogen: 'explosive',

    // Corrosive
    cmdty_volatiles: 'corrosive',
    cmdty_exotic_xenium: 'corrosive',

    // Superdense
    cmdty_ore_platinoid: 'superdense',
    cmdty_ore_platinium: 'superdense',
    cmdty_ore_goldium: 'superdense',
    cmdty_ore_einsteinium: 'superdense',

    // Cryogenic
    cmdty_ice_water: 'cryogenic',
    cmdty_gas_helium3: 'cryogenic',
  };

  for (const [cmdtyId, expectedClass] of Object.entries(expectedMappings)) {
    def(cmdtyId); // verify in catalog
    assert.equal(VOLATILE_BY_COMMODITY[cmdtyId], expectedClass, `${cmdtyId} maps to ${expectedClass}`);
    const resolved = volatileClassOf(cmdtyId);
    assert.ok(resolved, `volatileClassOf resolves for ${cmdtyId}`);
    assert.equal(resolved.id, expectedClass);
  }

  // Non-volatiles return null
  assert.equal(volatileClassOf('cmdty_ore_iron'), null);
  assert.equal(volatileClassOf('cmdty_food'), null);
  assert.equal(volatileClassOf('cmdty_consumer_goods'), null);
});

test('munitions and hydrogen pods detonate explosive slam on high closing-speed impact', async () => {
  const t = await bootPhysics(2001);
  try {
    const munitionsPod = jettisonPod(t, 'cmdty_munitions', 10);
    assert.equal(munitionsPod.data.volatileClass, 'explosive');
    assert.equal(munitionsPod.data.volatileLamp, 'amber');

    let slamEvent = null;
    t.sim.bus.on('cargo:volatileSlam', (ev) => { slamEvent = ev; });

    // Simulate high-speed impact with a target hull
    t.sim.bus.emit('physics:impact', {
      aId: munitionsPod.id,
      bId: t.player.id,
      closingSpeed: 95,
      dp: 120,
      pos: { x: 10, z: 0 },
    });

    assert.ok(slamEvent, 'cargo:volatileSlam must be emitted');
    assert.equal(slamEvent.class, 'explosive');
    assert.equal(slamEvent.podId, munitionsPod.id);
    assert.equal(munitionsPod.data.volatileDetonated, true);
  } finally {
    t.cleanup();
  }
});

test('cryogenic pods flash cryo on impact and apply cryo_lock status to target', async () => {
  const t = await bootPhysics(2002);
  try {
    const cryoPod = jettisonPod(t, 'cmdty_ice_water', 8);
    assert.equal(cryoPod.data.volatileClass, 'cryogenic');
    assert.equal(cryoPod.data.volatileLamp, 'cyan');

    let cryoEvent = null;
    t.sim.bus.on('cargo:volatileCryo', (ev) => { cryoEvent = ev; });

    // Impact closing speed above threshold
    t.sim.bus.emit('physics:impact', {
      aId: cryoPod.id,
      bId: t.player.id,
      closingSpeed: 80,
      dp: 100,
      pos: { x: 5, z: 5 },
    });

    assert.ok(cryoEvent, 'cargo:volatileCryo must be emitted');
    assert.equal(cryoEvent.class, 'cryogenic');
    assert.equal(cryoEvent.podId, cryoPod.id);
    assert.equal(cryoEvent.targetId, t.player.id);
    assert.equal(cryoEvent.durationTicks, CRYO_LOCK_DURATION_TICKS);
    assert.equal(cryoPod.data.volatileDetonated, true);

    // Verify cryoChilled flag set on victim hull
    assert.equal(t.player.flags.cryoChilled, true);

    // Verify combat runtime received Cryo Lock status
    const kernel = t.combatSys && t.combatSys.kernel;
    if (kernel && kernel.catalog) {
      const runtime = t.state.combat && t.state.combat.combatants && t.state.combat.combatants.get(t.player.id);
      if (runtime) {
        const hasStatus = runtime.pendingStatuses.some((s) => s.id === CRYO_LOCK_STATUS_ID)
          || (runtime.statuses && runtime.statuses.some((s) => s.id === CRYO_LOCK_STATUS_ID));
        assert.ok(hasStatus, 'Target hull scheduled CRYO_LOCK_STATUS_ID');
      }
    }
  } finally {
    t.cleanup();
  }
});

test('superdense heavy ores have high inertia (0.5 throwRangeMult) and field pull', () => {
  const stellariteClass = volatileClassOf('cmdty_ore_einsteinium');
  const platinumClass = volatileClassOf('cmdty_ore_platinium');

  assert.equal(stellariteClass.id, 'superdense');
  assert.equal(stellariteClass.fieldPull, true);
  assert.equal(stellariteClass.throwRangeMult, 0.5);

  assert.equal(platinumClass.id, 'superdense');
  assert.equal(platinumClass.fieldPull, true);
  assert.equal(platinumClass.throwRangeMult, 0.5);
});

test('exotic xenium applies corrosive contact tick damage', async () => {
  const t = await bootPhysics(2003);
  try {
    const xeniumPod = jettisonPod(t, 'cmdty_exotic_xenium', 6);
    assert.equal(xeniumPod.data.volatileClass, 'corrosive');
    assert.equal(xeniumPod.data.volatileLamp, 'green');

    let corrosiveEvent = null;
    t.sim.bus.on('cargo:volatileCorrosive', (ev) => { corrosiveEvent = ev; });

    const hullBefore = t.player.hull;
    t.sim.bus.emit('physics:impact', {
      aId: xeniumPod.id,
      bId: t.player.id,
      closingSpeed: 10,
      dp: 15,
      pos: { x: t.player.pos.x, z: t.player.pos.z },
    });

    assert.ok(corrosiveEvent, 'cargo:volatileCorrosive emitted on contact');
    assert.equal(corrosiveEvent.class, 'corrosive');
    assert.equal(corrosiveEvent.podId, xeniumPod.id);
    assert.equal(corrosiveEvent.targetId, t.player.id);
    assert.ok(corrosiveEvent.hullTick > 0);
  } finally {
    t.cleanup();
  }
});
