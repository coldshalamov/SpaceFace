// PQ-148.01 — volatile cargo classes.
// Three commodities, three outcomes, lamp/silhouette stamped for a later render read.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_KINDS } from '../src/data/fields.js';
import { COMMODITIES } from '../src/data/commodities.js';
import {
  VOLATILE_BY_COMMODITY,
  volatileClassOf,
} from '../src/data/commodityVolatileClasses.js';
import { combat } from '../src/systems/combat.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import {
  CORROSIVE_HULL_TICK,
  EXPLOSIVE_BLAST_RADIUS,
  JETTISONED_CARGO_PAYLOAD_TYPE,
  SUPERDENSE_FIELD_RESPONSE,
  fieldProfileForVolatilePod,
  lootShards,
  volatileThrowSpeedScale,
} from '../src/systems/lootShards.js';

const EXPLOSIVE_ID = 'cmdty_fuel_cells';
const CORROSIVE_ID = 'cmdty_volatiles';
const SUPERDENSE_ID = 'cmdty_ore_platinoid';
const IRON_ID = 'cmdty_ore_iron';

function def(id) {
  const row = COMMODITIES.find((item) => item.id === id);
  assert.ok(row, `${id} must exist`);
  return row;
}

function speed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot(Number(vel && vel.x) || 0, Number(vel && vel.z) || 0);
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

function teleport(entity, x, z) {
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  entity.vel.x = 0;
  entity.vel.z = 0;
  if (entity.physicsBody && typeof entity.physicsBody === 'object') {
    entity.physicsBody = {
      ...entity.physicsBody,
      revision: (entity.physicsBody.revision || 0) + 1,
    };
  }
}

function jettisonPod(t, commodityId, amount = 8) {
  assert.equal(addCargo(t.state, commodityId, amount), amount);
  assert.equal(t.cargoSys.jettison(commodityId, amount), amount);
  const pods = findPods(t.state).filter((pod) => pod.data.commodityId === commodityId);
  assert.equal(pods.length, 1, `one ${commodityId} pod`);
  return pods[0];
}

test('agy catalog maps three real commodities to three classes and lamps', () => {
  assert.equal(VOLATILE_BY_COMMODITY[EXPLOSIVE_ID], 'explosive');
  assert.equal(VOLATILE_BY_COMMODITY[CORROSIVE_ID], 'corrosive');
  assert.equal(VOLATILE_BY_COMMODITY[SUPERDENSE_ID], 'superdense');
  assert.equal(def(EXPLOSIVE_ID).id, EXPLOSIVE_ID);
  assert.equal(def(CORROSIVE_ID).id, CORROSIVE_ID);
  assert.equal(def(SUPERDENSE_ID).id, SUPERDENSE_ID);
  const lamps = [
    volatileClassOf(EXPLOSIVE_ID).lamp,
    volatileClassOf(CORROSIVE_ID).lamp,
    volatileClassOf(SUPERDENSE_ID).lamp,
  ];
  assert.equal(new Set(lamps).size, 3, 'three distinct lamps');
});

test('explosive slam publishes a radial impulse a nearby hull feels', async () => {
  const t = await bootPhysics(14811);
  try {
    const pod = jettisonPod(t, EXPLOSIVE_ID, 12);
    assert.equal(pod.data.volatileClass, 'explosive');
    assert.equal(pod.data.volatileLamp, 'amber');
    assert.ok(pod.data.volatileSilhouette);

    const witness = t.sim.spawn(shipSpec({
      team: 1,
      pos: { x: pod.pos.x, z: pod.pos.z + 36 },
      mass: 16,
    }));
    const anvil = t.sim.spawn(shipSpec({
      team: 1,
      pos: { x: pod.pos.x - 8, z: pod.pos.z },
      mass: 40,
      hull: 200,
      hullMax: 200,
    }));

    t.sim.step();
    const before = speed(witness);
    const witnessVelBefore = { x: witness.vel.x, z: witness.vel.z };
    t.sim.bus.emit('physics:impact', {
      aId: pod.id,
      bId: anvil.id,
      preSolveClosingSpeed: 22,
      dp: 240,
      pos: { x: pod.pos.x, z: pod.pos.z },
      tick: t.state.tick,
    });

    for (let i = 0; i < 8; i++) t.sim.step();
    const witnessDv = speed(witness) - before;
    const applied = Number(pod.data.volatileSlamImpulse) || 0;
    console.log(
      `PQ-148.01 explosive slam: witnessΔv=${witnessDv.toFixed(3)} WU/s `
      + `radialImpulse=${applied.toFixed(1)} lamp=${pod.data.volatileLamp} `
      + `radius=${EXPLOSIVE_BLAST_RADIUS}`,
    );
    assert.equal(pod.data.volatileDetonated, true);
    assert.ok(applied > 0, 'radial published impulse sum must be > 0');
    assert.ok(witnessDv > 0.5, `nearby hull must move from the blast, Δv=${witnessDv}`);
    assert.ok(
      witness.vel.x !== witnessVelBefore.x || witness.vel.z !== witnessVelBefore.z,
      'witness motion came from published impulse, not a test vel assign',
    );
  } finally {
    t.cleanup();
  }
});

test('corrosive contact ticks hull once, not a distance aura', async () => {
  const t = await bootPhysics(14812);
  try {
    const pod = jettisonPod(t, CORROSIVE_ID, 8);
    assert.equal(pod.data.volatileClass, 'corrosive');
    assert.equal(pod.data.volatileLamp, 'green');

    const far = t.sim.spawn(shipSpec({
      team: 1,
      pos: { x: pod.pos.x + 220, z: pod.pos.z },
      hull: 80,
      hullMax: 80,
    }));
    const hull = t.sim.spawn(shipSpec({
      team: 1,
      pos: { x: pod.pos.x + 6, z: pod.pos.z },
      hull: 80,
      hullMax: 80,
    }));

    const farBefore = far.hull;
    const hullBefore = hull.hull;
    t.sim.bus.emit('physics:impact', {
      aId: pod.id,
      bId: hull.id,
      preSolveClosingSpeed: 4,
      dp: 20,
      pos: { x: pod.pos.x, z: pod.pos.z },
      tick: t.state.tick,
    });
    t.sim.step();

    const hullTick = hullBefore - hull.hull;
    console.log(
      `PQ-148.01 corrosive contact: hullTick=${hullTick.toFixed(3)} `
      + `farHull=${(farBefore - far.hull).toFixed(3)} lamp=${pod.data.volatileLamp}`,
    );
    assert.ok(hullTick > 0, `contact hull must drop, lost=${hullTick}`);
    assert.ok(hullTick + 0.001 >= CORROSIVE_HULL_TICK * 0.25, 'tick is a real hull bite');
    assert.equal(far.hull, farBefore, 'distant hull is untouched — not an HP aura');
  } finally {
    t.cleanup();
  }
});

test('superdense pulls on fields and cannot be thrown far', async () => {
  const t = await bootPhysics(14813);
  try {
    t.player.vel.x = 0;
    t.player.vel.z = 0;
    t.player.rot = 0;

    const iron = jettisonPod(t, IRON_ID, 8);
    assert.equal(iron.data.volatileClass, undefined);
    const ironThrow = speed(iron);

    iron.alive = false;
    t.state.entities.delete(iron.id);
    t.state.entityList = t.state.entityList.filter((entity) => entity !== iron);

    const dense = jettisonPod(t, SUPERDENSE_ID, 8);
    assert.equal(dense.data.volatileClass, 'superdense');
    assert.equal(dense.data.volatileLamp, 'violet');
    assert.ok(dense.data.volatileSilhouette);
    const denseThrow = speed(dense);
    assert.equal(volatileThrowSpeedScale(SUPERDENSE_ID), 0.5);
    assert.ok(denseThrow < ironThrow * 0.7, `superdense throw ${denseThrow} must be shorter than iron ${ironThrow}`);

    const well = normalizeField({
      id: 'pq148_well',
      kind: FIELD_KINDS.WELL,
      center: { x: 0, z: 0 },
      radius: 200,
      strength: 240,
      falloff: 1.5,
      durationS: Infinity,
      createdAt: 0,
    });
    const pos = { x: 70, z: 0 };
    const denseAccel = sampleFieldAcceleration(
      pos,
      { x: 0, z: 0 },
      [well],
      0,
      fieldProfileForVolatilePod(dense),
      { ax: 0, az: 0 },
    );
    const ironTwin = {
      type: 'payload',
      mass: dense.mass,
      data: { commodityId: IRON_ID },
    };
    const ironAccel = sampleFieldAcceleration(
      pos,
      { x: 0, z: 0 },
      [well],
      0,
      fieldProfileForVolatilePod(ironTwin),
      { ax: 0, az: 0 },
    );
    const denseMag = Math.hypot(denseAccel.ax, denseAccel.az);
    const ironMag = Math.hypot(ironAccel.ax, ironAccel.az);
    assert.ok(denseMag > ironMag * 1.2, `superdense field pull ${denseMag} must beat iron ${ironMag}`);
    assert.equal(fieldProfileForVolatilePod(dense).fieldResponseMult, SUPERDENSE_FIELD_RESPONSE);

    t.state.fields = { schemaVersion: 1, snapshot: [well] };
    teleport(dense, 70, 0);
    t.sim.step();
    for (let i = 0; i < 12; i++) t.sim.step();
    assert.ok(dense.vel.x < 0, 'well pulls the superdense pod inward via published extra coupling');

    console.log(
      `PQ-148.01 superdense: throwSpeed=${denseThrow.toFixed(3)} WU/s `
      + `ironThrow=${ironThrow.toFixed(3)} fieldAccel=${denseMag.toFixed(3)} `
      + `ironAccel=${ironMag.toFixed(3)} lamp=${dense.data.volatileLamp}`,
    );
  } finally {
    t.cleanup();
  }
});
