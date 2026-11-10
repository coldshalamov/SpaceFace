// PQ-148.00 — pods are bodies.
// Jettisoned ore is a colliding persistent payload (not a TTL pickup). A shoved pod
// must move a light hostile (Wasp / Hitch-scale) by ≥ 30% of that hull's cruise.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { interactionProfileForEntity } from '../src/data/entityInteractionProfiles.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  MAX_JETTISONED_CARGO_PODS,
  cargoPodMassForContents,
  enforceJettisonedCargoPodCap,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';

const COMMODITY_ID = 'cmdty_ore_iron';
const IRON = COMMODITIES.find((row) => row.id === COMMODITY_ID);
const SHIP_BY_ID = new Map(SHIPS.map((ship) => [ship.id, ship]));
const ORE_SHOTGUN_FRACTION = 0.30;

function hitch() {
  const def = SHIP_BY_ID.get('ship_kestrel');
  assert.ok(def, 'Hitch hull exists as ship_kestrel');
  return def;
}

function wasp() {
  const def = SHIP_BY_ID.get('ship_wasp');
  assert.ok(def, 'Wasp hull exists');
  return def;
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

function bootCargoOnly() {
  const state = createGameState(14800);
  state.mode = 'flight';
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 12, z: -4 },
    rot: 0,
    radius: 14,
    mass: hitch().mass,
    factionId: 'player',
    flags: {},
    data: { defId: 'ship_kestrel' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList = [player];
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = (state.nextEntityId = (state.nextEntityId || 10) + 1);
      const entity = {
        id,
        ...spec,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        flags: { ...(spec.flags || {}) },
        data: spec.data ? { ...spec.data } : {},
        alive: true,
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(spec);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      return true;
    },
  };
  const system = Object.create(cargo);
  system.init({ state, bus, helpers });
  return { state, bus, helpers, system, player, spawned };
}

async function bootPhysics(seed = 14801) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: [cargo, physics],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const hitchDef = hitch();
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: hitchDef.collisionRadius,
    mass: hitchDef.mass,
    hull: hitchDef.hull,
    hullMax: hitchDef.hull,
    driveId: hitchDef.driveId,
    collides: true,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: hitchDef.collisionRadius,
      mass: hitchDef.mass,
      inertiaY: 88,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { defId: hitchDef.id },
  });
  state.playerId = player.id;
  const physicsSys = sim.registry.get('physics');
  const cargoSys = sim.registry.get('cargo');
  const ready = await physicsSys.prepareBackend(state);
  assert.equal(ready, true, 'rapier-dynamic should initialize headless');
  return {
    sim,
    state,
    helpers,
    player,
    cargoSys,
    physicsSys,
    cleanup() {
      if (typeof physicsSys._disableSg02DynamicAuthority === 'function') {
        physicsSys._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
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

test('Hitch is ship_kestrel; Pulse is not nerfed; Wasp cruise is the shotgun bar', () => {
  assert.equal(hitch().name, 'Hitch');
  assert.equal(hitch().id, 'ship_kestrel');
  assert.equal(hitch().mass, 18);
  const pulse = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s');
  assert.ok(pulse, 'Pulse exists');
  assert.equal(pulse.impulsePerHit, 84, 'PQ-148.00 does not nerf Pulse');
  assert.equal(pulse.damageType, 'energy', 'do not retune Pulse onto radiation');
  assert.equal(wasp().mass, 16);
  assert.equal(IRON.massPerU, 0.8);
});

test('jettison spawns a colliding persistent payload, not a TTL pickup', () => {
  const h = bootCargoOnly();
  try {
    assert.equal(addCargo(h.state, COMMODITY_ID, 8), 8);
    assert.equal(h.system.jettison(COMMODITY_ID, 8), 8);
    assert.equal(h.state.player.cargo.items[COMMODITY_ID] || 0, 0);

    const pods = findPods(h.state);
    assert.equal(pods.length, 1, 'exactly one jettisoned cargo body');
    const pod = pods[0];
    assert.equal(pod.type, 'payload');
    assert.notEqual(pod.type, 'pickup');
    assert.equal(pod.collides, true, 'pod is a colliding body');
    assert.equal(pod.flags.persistent, true, 'Continue residency');
    assert.equal(pod.data.despawnAt, undefined, 'TTL pickup despawn is forbidden');
    assert.equal(pod.data.jettisonedCargo, true);
    assert.equal(pod.data.kind, 'cargo');
    assert.equal(pod.data.commodityId, COMMODITY_ID);
    assert.equal(pod.data.amount, 8);
    assert.deepEqual(pod.data.salvagePool, { [COMMODITY_ID]: 8 });
    assert.equal(pod.mass, cargoPodMassForContents(IRON.massPerU, 8));
    assert.ok(pod.mass >= 20, `mass-by-contents floor, got ${pod.mass}`);
    assert.ok(pod.vel.x < 0, 'inherits aft eject plus ship velocity');
    assert.equal(pod.vel.z, -4, 'inherits player Z velocity');
    assert.equal(interactionProfileForEntity(pod).tetherable, true);
    assert.equal(interactionProfileForEntity(pod).kind, 'payload');

    const spec = h.spawned[0];
    assert.equal(spec.type, 'payload');
    assert.equal(spec.collides, true);
    assert.equal(spec.data.kind, 'cargo');
    assert.equal(spec.data.amount, 8);
    assert.equal(spec.data.despawnAt, undefined);
  } finally {
    h.system.destroy?.();
    h.bus.clear();
  }
});

test('save/Continue round-trips the jettisoned pod', () => {
  const h = bootCargoOnly();
  try {
    addCargo(h.state, COMMODITY_ID, 5);
    h.system.jettison(COMMODITY_ID, 5);
    const before = findPods(h.state)[0];
    assert.ok(before);

    const save = Object.create(saveSystem);
    save.state = h.state;
    save.helpers = h.helpers;
    save.registry = { get: () => null };
    const serialized = save._serializeEntities();
    const persisted = serialized.persistent.filter((row) => row
      && row.data
      && row.data.payloadType === JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(persisted.length, 1, 'serialize writes the pod as a persistent actor');
    assert.equal(persisted[0].flags.persistent, true);
    assert.equal(persisted[0].collides, true);
    assert.equal(persisted[0].data.despawnAt, undefined);
    assert.deepEqual(persisted[0].data.salvagePool, { [COMMODITY_ID]: 5 });
    assert.equal(persisted[0].data.amount, 5);
    assert.equal(persisted[0].mass, before.mass);

    before.alive = false;
    h.state.entities.delete(before.id);
    h.state.entityList = h.state.entityList.filter((entity) => entity !== before);
    assert.equal(findPods(h.state).length, 0);

    save._spawnPersistentEntities(serialized.persistent);
    const after = findPods(h.state);
    assert.equal(after.length, 1, 'Continue rematerializes the pod');
    assert.equal(after[0].flags.persistent, true);
    assert.equal(after[0].collides, true);
    assert.equal(after[0].type, 'payload');
    assert.deepEqual(after[0].data.salvagePool, { [COMMODITY_ID]: 5 });
    assert.equal(after[0].data.commodityId, COMMODITY_ID);
    assert.equal(after[0].data.amount, 5);
    assert.equal(after[0].mass, before.mass);
    assert.equal(interactionProfileForEntity(after[0]).tetherable, true);
  } finally {
    h.system.destroy?.();
    h.bus.clear();
  }
});

test('live jettisoned-pod cap disposes oldest excess', () => {
  const state = {
    nextEntityId: 1,
    entities: new Map(),
    entityList: [],
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { id, ...spec, flags: { ...spec.flags }, data: { ...spec.data }, alive: true };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      return !!entity;
    },
  };
  for (let i = 0; i < MAX_JETTISONED_CARGO_PODS + 3; i++) {
    spawnJettisonedCargoPod(state, {
      pos: { x: i * 8, z: 0 },
      vel: { x: 0, z: 0 },
      commodityId: COMMODITY_ID,
      amount: 1,
      unitMass: IRON.massPerU,
    }, helpers);
  }
  const live = findPods(state);
  assert.equal(live.length, MAX_JETTISONED_CARGO_PODS);
  assert.equal(enforceJettisonedCargoPodCap(state, helpers.removeEntity), 0);
});

test('ore shotgun: shoved pod moves a Wasp ≥ 30% cruise on rapier-dynamic', async () => {
  const t = await bootPhysics(14802);
  try {
    const waspDef = wasp();
    const hostile = t.sim.spawn({
      type: 'ship',
      team: 1,
      pos: { x: -96, z: 0 },
      vel: { x: 0, z: 0 },
      rot: Math.PI,
      angVel: 0,
      radius: waspDef.collisionRadius,
      mass: waspDef.mass,
      hull: waspDef.hull,
      hullMax: waspDef.hull,
      driveId: waspDef.driveId,
      collides: true,
      flags: {},
      physicsBody: {
        schemaVersion: 1,
        radius: waspDef.collisionRadius,
        mass: waspDef.mass,
        inertiaY: 40,
        dynamic: true,
        ccd: true,
        material: 'ship',
        revision: 0,
      },
      data: { defId: waspDef.id },
    });

    t.state.player.cargo.capVolume = 40;
    t.state.player.cargo.capMass = 60;
    assert.equal(addCargo(t.state, COMMODITY_ID, 40), 40);
    assert.equal(t.cargoSys.jettison(COMMODITY_ID, 40), 40);

    const pod = findPods(t.state)[0];
    assert.ok(pod, 'jettison must leave a cargo body');
    assert.equal(pod.collides, true);
    assert.equal(pod.flags.persistent, true);

    // Park Hitch clear of the shot so player-contact-give cannot steal the collision.
    teleport(t.player, 420, 380);
    t.sim.step();

    const cruise = resolveGovernedCombatSpeed(hostile, t.state, 105);
    assert.ok(cruise > 0, `Wasp cruise must be governed, got ${cruise}`);
    const waspBefore = speed(hostile);
    const podBeforeShove = speed(pod);

    let shoved = false;
    for (let i = 0; i < 8 && !shoved; i++) {
      shoved = t.helpers.combatPhysics.applyImpulse({
        entityId: pod.id,
        impulse: { x: -pod.mass * 90, z: 0 },
        point: null,
        reason: 'pq148_ore_shotgun',
        tick: t.state.tick,
      }) === true;
      t.sim.step();
    }
    assert.equal(shoved, true, 'published impulse must land on the pod (not a fake hostile vel write)');

    const podAfterShove = speed(pod);
    const podDv = podAfterShove - podBeforeShove;

    let waspPeak = speed(hostile);
    let hitTicks = 0;
    for (let i = 0; i < 220; i++) {
      t.sim.step();
      hitTicks += 1;
      const now = speed(hostile);
      if (now > waspPeak) waspPeak = now;
      if (waspPeak - waspBefore >= ORE_SHOTGUN_FRACTION * cruise) break;
    }

    const hostileDv = waspPeak - waspBefore;
    const cruiseFraction = hostileDv / cruise;
    console.log(
      `PQ-148.00 ore shotgun: shoved-pod Δv=${podDv.toFixed(3)} WU/s `
      + `hostile Δv=${hostileDv.toFixed(3)} WU/s `
      + `cruise=${cruise.toFixed(1)} fraction=${cruiseFraction.toFixed(3)} `
      + `ticks=${hitTicks} backend=rapier-dynamic`,
    );

    assert.ok(podDv > 5, `shoved pod must gain real speed from the impulse, Δv=${podDv}`);
    assert.ok(
      cruiseFraction >= ORE_SHOTGUN_FRACTION,
      `Wasp Δspeed ${hostileDv.toFixed(3)} must be ≥ ${ORE_SHOTGUN_FRACTION} × cruise ${cruise} `
      + `(got ${cruiseFraction.toFixed(3)})`,
    );
    assert.equal(hostile.vel.x === 0 && hostile.vel.z === 0 ? 0 : 1, 1,
      'hostile motion came from contact, not a direct velocity assign');
  } finally {
    t.cleanup();
  }
});
