import assert from 'node:assert/strict';
import test from 'node:test';

import { couplingScale } from '../src/core/fields/fieldKernel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { FIELD_COUPLING, FIELD_FLAGS } from '../src/data/fields.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { fieldBodyProfile, fields } from '../src/systems/fields.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;
const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));

function weaponRuntime(defId) {
  const definition = WEAPON_BY_ID.get(defId);
  assert.ok(definition, `missing weapon definition ${defId}`);
  return {
    ...definition,
    defId,
    slotIndex: 0,
    facing: 'front',
    facingAngle: 0,
    gimbalArc: 0.4,
    muzzleOffset: [0.8, 0],
    _cooldown: 0,
    _heat: 0,
  };
}

function routeShip({ team, x, z = 0, mass = 16, radius = 6, hull = 300, weaponId = null, velX = 0 }) {
  return {
    type: 'ship', team, collides: true,
    pos: { x, z }, vel: { x: velX, z: 0 }, rot: 0, angVel: 0,
    radius, mass, hull, hullMax: hull,
    armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0,
    cap: 500, capMax: 500, capRegen: 0,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: Math.max(1, mass * radius * radius * 0.5),
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      derived: { damageReductionMult: 1 },
      combat: {},
      weapons: weaponId ? [weaponRuntime(weaponId)] : [],
    },
  };
}

function routeRock({ x, z = 0, radius = 15 }) {
  return {
    type: 'asteroid', team: 9, collides: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius, mass: 1_000_000, hull: 10_000, hullMax: 10_000, flags: {}, data: {},
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      material: 'asteroid',
      revision: 0,
    },
  };
}

async function prepareRoute(t, { seed, systems, updateOrder }) {
  const previousImpulse = COMBAT_FLAGS.weaponImpulseConsequences;
  const previousFields = FIELD_FLAGS.enabled;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed, bus: createBus(), systems, updateOrder });
  const { state } = sim;
  state.mode = 'flight';
  state.ui.docked = false;
  state.ui.screenStack = [];
  state.input.actions = {};
  state.input.fire = false;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsOwner = sim.registry.get('physics');
  assert.ok(physicsOwner, 'route includes the production physics owner');
  const ready = await physicsOwner.prepareBackend(state);
  assert.equal(ready, true, 'headless SG-02 authority initializes');
  t.after(() => {
    if (typeof physicsOwner._disableSg02DynamicAuthority === 'function') physicsOwner._disableSg02DynamicAuthority();
    sim.dispose();
    COMBAT_FLAGS.weaponImpulseConsequences = previousImpulse;
    FIELD_FLAGS.enabled = previousFields;
  });
  return sim;
}

function aimAt(state, target) {
  state.input.aimAngle = Math.atan2(target.pos.z - state.entities.get(state.playerId).pos.z,
    target.pos.x - state.entities.get(state.playerId).pos.x);
  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.autoAim = { targetId: target.id };
}

function maxPairDistance(entities) {
  let max = 0;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      max = Math.max(max, Math.hypot(
        entities[i].pos.x - entities[j].pos.x,
        entities[i].pos.z - entities[j].pos.z,
      ));
    }
  }
  return max;
}

test('the physics-arsenal delta-v ladder keeps each mass class and the new precision lane distinct', () => {
  const ids = [
    'wpn_concussion_cannon_m',
    'wpn_vector_mine_m',
    'wpn_impulse_lance_m',
    'wpn_siege_lance_l',
  ];
  const rows = ids.flatMap((id) => [16, 60, 150].map((mass) => ({
    id,
    mass,
    deltaV: WEAPON_BY_ID.get(id).impulsePerHit / mass,
  })));

  assert.deepEqual(rows.filter((row) => row.id === 'wpn_concussion_cannon_m').map((row) => row.deltaV),
    [26.25, 7, 2.8]);
  assert.deepEqual(rows.filter((row) => row.id === 'wpn_impulse_lance_m').map((row) => row.deltaV),
    [45, 12, 4.8]);
  assert.deepEqual(rows.filter((row) => row.id === 'wpn_siege_lance_l').map((row) => row.deltaV),
    [60, 16, 6.4]);

  const concussion = WEAPON_BY_ID.get('wpn_concussion_cannon_m');
  const lance = WEAPON_BY_ID.get('wpn_impulse_lance_m');
  const siege = WEAPON_BY_ID.get('wpn_siege_lance_l');
  assert.ok(concussion.impulsePerHit < lance.impulsePerHit && lance.impulsePerHit < siege.impulsePerHit,
    'Concussion < precision throw < capital siege is a real impulse ladder');
  assert.ok(lance.dmg < concussion.dmg && lance.range > 2 * concussion.range,
    'the Lance buys selected long-range momentum by giving up damage, heat endurance, and cadence');
  assert.ok(lance.impulsePerHit / 150 < 5,
    'even the precision throw stays below a five-wu/s full-hit response on a mass-150 hull');

  const graviton = TECH_NODES.find((node) => node.id === 'tech_graviton_drives');
  assert.ok(graviton.unlocks.modules.includes(lance.id), 'ordinary tech progression unlocks the Lance');
  assert.ok(lance.price > 0 && lance.requiresTech === graviton.id, 'the Lance remains an obtainable market item');
});

test('one Concussion round physically puts a live light hull into real terrain before a heat cycle ends', async (t) => {
  const sim = await prepareRoute(t, {
    seed: 0x030301,
    systems: [physics, combat, actions, collisionConsequences, weapons],
    updateOrder: [actions, weapons, physics, combat, collisionConsequences],
  });
  const { state, bus } = sim;
  const player = sim.spawn(routeShip({ team: 0, x: 0, mass: 24, radius: 7, weaponId: 'wpn_concussion_cannon_m' }));
  const hostile = sim.spawn(routeShip({ team: 1, x: 55, mass: 16, radius: 6, hull: 180 }));
  const rock = sim.spawn(routeRock({ x: 94, radius: 15 }));
  state.playerId = player.id;
  aimAt(state, hostile);

  const fired = [];
  const hits = [];
  const impacts = [];
  bus.on('combat:fire', (payload) => {
    if (payload.ownerId === player.id) fired.push(structuredClone(payload));
  });
  bus.on('projectile:hit', (payload) => {
    if (payload.ownerId === player.id) {
      hits.push(structuredClone(payload));
      state.input.fire = false;
    }
  });
  bus.on('physics:impact', (payload) => impacts.push(structuredClone(payload)));

  state.input.fire = true;
  for (let tick = 0; tick < 240 && !impacts.some((payload) => (
    payload.aId === hostile.id && payload.bId === rock.id
  ) || (
    payload.aId === rock.id && payload.bId === hostile.id
  )); tick++) sim.step(SIM_DT);

  assert.equal(hits.length, 1, 'the live swept projectile path lands one Concussion packet');
  assert.equal(hits[0].weaponId, 'wpn_concussion_cannon_m');
  assert.equal(fired.length, 1, 'the trigger is released on the first hit, well inside one six-round heat budget');
  assert.ok(impacts.some((payload) => new Set([payload.aId, payload.bId]).has(hostile.id)
      && new Set([payload.aId, payload.bId]).has(rock.id)),
  'the thrown hull reaches a Rapier terrain contact rather than a scripted damage shortcut');
  assert.ok(hostile.pos.x > 60, `the target was physically displaced toward terrain (x=${hostile.pos.x})`);
});

test('Impulse Lance fires through the live projectile/combat authority and cannot tumble a heavy hull', async (t) => {
  const sim = await prepareRoute(t, {
    seed: 0x030302,
    systems: [physics, combat, actions, weapons],
    updateOrder: [actions, weapons, physics, combat],
  });
  const { state, bus } = sim;
  const player = sim.spawn(routeShip({ team: 0, x: 0, mass: 24, radius: 7, weaponId: 'wpn_impulse_lance_m' }));
  const heavy = sim.spawn(routeShip({ team: 1, x: 500, mass: 150, radius: 15, hull: 900 }));
  state.playerId = player.id;
  aimAt(state, heavy);

  let liveHit = null;
  bus.on('projectile:hit', (payload) => {
    if (payload.ownerId === player.id) {
      liveHit = structuredClone(payload);
      state.input.fire = false;
    }
  });
  state.input.fire = true;
  for (let tick = 0; tick < 90 && !liveHit; tick++) sim.step(SIM_DT);
  assert.ok(liveHit, 'the actual Lance projectile crosses its long-range lane and hits');
  assert.equal(liveHit.weaponId, 'wpn_impulse_lance_m');
  assert.equal(liveHit.damagePacket.impulse.magnitude, 720);
  for (let tick = 0; tick < 4; tick++) sim.step(SIM_DT);
  assert.ok(heavy.vel.x > 4 && heavy.vel.x < 5,
    `the solver realizes the mass-150 response without class erasure (vx=${heavy.vel.x})`);
  assert.equal(readTumbleStatus(state, heavy), null, 'mass-150 is below the shared tumble threshold');
  assert.ok(heavy.hull > 890 && heavy.hull < 900,
    `the precision throw remains low-damage after ordinary mitigation (hull=${heavy.hull})`);
});

test('a live Well clumps three surviving light ships into one impulse-charge blast', async (t) => {
  const sim = await prepareRoute(t, {
    seed: 0x030303,
    systems: [physics, combat, fields, impulseCharges],
    updateOrder: [fields, impulseCharges, physics, combat],
  });
  const { state, bus } = sim;
  const player = sim.spawn(routeShip({ team: 0, x: 0, mass: 24, radius: 7, hull: 600 }));
  state.playerId = player.id;
  state.player.cargo = {
    items: { cmdty_impulse_charge: 1 },
    usedVolume: 2,
    usedMass: 1,
    capVolume: 100,
    capMass: 100,
  };
  const victims = [
    sim.spawn(routeShip({ team: 1, x: 300, z: -92, mass: 16, radius: 5, hull: 240 })),
    sim.spawn(routeShip({ team: 1, x: 380, z: 46, mass: 16, radius: 5, hull: 240 })),
    sim.spawn(routeShip({ team: 1, x: 220, z: 46, mass: 16, radius: 5, hull: 240 })),
  ];
  const initialSpread = maxPairDistance(victims);
  state.input.aimWorld = { x: 300, z: 0 };
  state.input.actions.deployWell = true;
  sim.step(SIM_DT);
  for (let tick = 0; tick < 300 && maxPairDistance(victims) > 34; tick++) sim.step(SIM_DT);

  const clumpedSpread = maxPairDistance(victims);
  assert.ok(victims.every((entity) => entity.alive && entity.hull > 0), 'all three light ships survive the setup');
  assert.ok(clumpedSpread <= 34 && clumpedSpread < initialSpread * 0.25,
    `the Well makes one blast-sized clump (spread ${initialSpread} -> ${clumpedSpread})`);

  const center = victims.reduce((sum, entity) => ({ x: sum.x + entity.pos.x / 3, z: sum.z + entity.pos.z / 3 }), { x: 0, z: 0 });
  state.input.aimWorld = center;
  state.input.actions.chargeThrow = true;
  sim.step(SIM_DT);
  let charge = state.entityList.find((entity) => entity.type === 'charge' && entity.alive);
  assert.ok(charge, 'the ordinary cargo-backed throw spawns the physical explosive');
  for (let tick = 0; tick < 180 && !charge.data.armed; tick++) sim.step(SIM_DT);
  assert.equal(charge.data.armed, true, 'the thrown explosive reaches and sticks to the clump');

  let detonation = null;
  bus.on('charge:detonated', (payload) => { detonation = structuredClone(payload); });
  state.input.actions.chargeDetonate = true;
  sim.step(SIM_DT);
  assert.ok(detonation, 'the existing detonation verb resolves');
  assert.ok(victims.every((entity) => detonation.hits.includes(entity.id)),
    `one physical blast includes all three live ships (hits=${detonation.hits.join(',')})`);
  assert.ok(victims.every((entity) => entity.alive && entity.hull < 240),
    'the combo damages but does not test-script away the three live targets');
});

test('Repulsor physically turns a closing pursuer into increasing separation', async (t) => {
  const sim = await prepareRoute(t, {
    seed: 0x030304,
    systems: [physics, fields],
    updateOrder: [fields, physics],
  });
  const { state } = sim;
  const player = sim.spawn(routeShip({ team: 0, x: 0, mass: 24, radius: 7, velX: 20 }));
  const pursuer = sim.spawn(routeShip({ team: 1, x: -80, mass: 16, radius: 6, velX: 50 }));
  state.playerId = player.id;
  const initialDistance = player.pos.x - pursuer.pos.x;
  const initialClosingSpeed = pursuer.vel.x - player.vel.x;
  assert.ok(initialClosingSpeed > 0, 'the hostile starts as a real closing chase');

  state.input.actions.deployRepulsor = true;
  sim.step(SIM_DT);
  let closest = initialDistance;
  for (let tick = 0; tick < 90; tick++) {
    sim.step(SIM_DT);
    closest = Math.min(closest, player.pos.x - pursuer.pos.x);
  }
  const finalDistance = player.pos.x - pursuer.pos.x;
  const finalClosingSpeed = pursuer.vel.x - player.vel.x;
  assert.ok(finalClosingSpeed < 0,
    `the live field reverses radial closure instead of applying a chase flag (${initialClosingSpeed} -> ${finalClosingSpeed})`);
  assert.ok(finalDistance > closest + 10,
    `separation grows materially after closest approach (${closest} -> ${finalDistance})`);
});

test('a real Gravity Marker hit makes one matched hull couple materially harder than its control', async (t) => {
  const sim = await prepareRoute(t, {
    seed: 0x030305,
    systems: [physics, combat, actions, weapons, fields],
    updateOrder: [actions, weapons, fields, physics, combat],
  });
  const { state, bus } = sim;
  const player = sim.spawn(routeShip({ team: 0, x: 0, mass: 24, radius: 7, weaponId: 'wpn_gravity_marker_s' }));
  const marked = sim.spawn(routeShip({ team: 1, x: 300, z: 80, mass: 60, radius: 8, hull: 300 }));
  const control = sim.spawn(routeShip({ team: 1, x: 300, z: -80, mass: 60, radius: 8, hull: 300 }));
  state.playerId = player.id;
  aimAt(state, marked);

  let markerHit = null;
  bus.on('projectile:hit', (payload) => {
    if (payload.ownerId === player.id) {
      markerHit = structuredClone(payload);
      state.input.fire = false;
    }
  });
  state.input.fire = true;
  for (let tick = 0; tick < 80 && !markerHit; tick++) sim.step(SIM_DT);
  assert.ok(markerHit, 'the status starts from a live Gravity Marker projectile hit');
  assert.equal(markerHit.weaponId, 'wpn_gravity_marker_s');
  assert.equal(markerHit.targetId, marked.id, 'the live swept hit lands on the selected matched hull');
  sim.step(SIM_DT); // status applications enter on the next authoritative pre-physics phase
  assert.ok(fieldBodyProfile(marked, state).fieldResponseMult > fieldBodyProfile(control, state).fieldResponseMult,
    'combat status is visible to the production field profile before deployment');

  const before = {
    marked: { x: marked.vel.x, z: marked.vel.z },
    control: { x: control.vel.x, z: control.vel.z },
  };
  state.input.aimWorld = { x: 300, z: 0 };
  state.input.actions.deployWell = true;
  sim.step(SIM_DT);
  for (let tick = 0; tick < 30; tick++) sim.step(SIM_DT);
  const markedDelta = Math.hypot(marked.vel.x - before.marked.x, marked.vel.z - before.marked.z);
  const controlDelta = Math.hypot(control.vel.x - before.control.x, control.vel.z - before.control.z);
  assert.ok(controlDelta > 0.4, `the matched control is genuinely inside the Well (delta-v=${controlDelta})`);
  assert.ok(markedDelta > controlDelta * 1.55,
    `the landed mark materially strengthens the same physical field (${markedDelta} vs ${controlDelta})`);
});

test('Gravity Mark materially improves light and heavy hull coupling without erasing mass class', () => {
  const light = couplingScale({ type: 'ship', mass: 16, fieldResponseMult: 1 });
  const markedLight = couplingScale({ type: 'ship', mass: 16, fieldResponseMult: 1.9 });
  const heavy = couplingScale({ type: 'ship', mass: 150, fieldResponseMult: 1 });
  const markedHeavy = couplingScale({ type: 'ship', mass: 150, fieldResponseMult: 1.9 });

  assert.ok(markedLight > light, 'the mark must improve the canonical light-hull tier');
  assert.equal(markedLight, FIELD_COUPLING.markedCap, 'the marked light response stops at the authored cap');
  assert.ok(markedHeavy > heavy, 'the mark must also help a heavy hull');
  assert.ok(markedHeavy < markedLight, 'a marked heavy hull still shrugs more than a marked light hull');
  assert.ok(markedLight < 1, 'marked hulls do not inherit the natural full coupling of tiny bodies');
});

test('the field profile reads combat-owned effective mass without changing coupling mass', () => {
  const entity = dynamicBody(7, 24);
  const state = {
    combat: {
      entities: {
        '7': {
          multipliers: { fieldCoupling: 1.9 },
          physicsResponse: { massScale: 6 },
        },
      },
    },
  };

  const profile = fieldBodyProfile(entity, state);
  assert.equal(profile.mass, 24, 'coupling continues to classify by authored hull mass');
  assert.equal(profile.fieldResponseMult, 1.9);
  assert.equal(profile.physicsMassScale, 6, 'the impulse author sees the mass the solver will use');
});

test('field impulse is authored against solver-effective mass so the acceleration cap stays real', () => {
  const pinned = dynamicBody(11, 20);
  const state = {
    tick: 10,
    simTime: 10 * DT,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[pinned.id, pinned]]),
    entityList: [pinned],
    input: { actions: {} },
    combat: {
      beams: [],
      threatTables: new Map(),
      entities: {
        '11': {
          multipliers: { fieldCoupling: 1 },
          physicsResponse: { massScale: 6 },
        },
      },
    },
  };
  const bus = createBus();
  fields.init({
    state,
    bus,
    helpers: { queryRadius: (_center, _radius, out) => { out.length = 0; out.push(pinned); } },
    registry: { get: () => null },
  });
  fields.registerExternal({
    id: 'test-effective-mass-well',
    kind: 'well',
    center: { x: 0, z: 0 },
    radius: 200,
    strength: 300,
    damping: 0,
    falloff: 1,
    createdAt: state.simTime,
  });

  const result = fields._applyForces(DT, state, state.fields);
  const command = consumePhysicsCommand(pinned);
  assert.equal(result.affected, 1);
  assert.equal(command.impulses.length, 1);

  const impulse = command.impulses[0];
  const effectiveMass = pinned.physicsBody.mass * 6;
  const realizedAcceleration = Math.hypot(impulse.x, impulse.z) / effectiveMass / DT;
  assert.ok(realizedAcceleration > 0, 'the live field queues a nonzero impulse');
  assert.ok(realizedAcceleration <= 300, 'solver-effective acceleration remains inside the authored field strength');

  const authoredAgainst = Math.hypot(impulse.x, impulse.z) / DT;
  assert.ok(authoredAgainst > pinned.physicsBody.mass * 300 * 0.1,
    'the impulse includes the transient solver mass rather than the authored mass alone');
});

function dynamicBody(id, mass) {
  return {
    id,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 8,
    mass,
    hull: 100,
    hullMax: 100,
    flags: {},
    data: { combatProfileId: 'combat_profile_standard_ship' },
    physicsBody: {
      schemaVersion: 1,
      radius: 8,
      mass,
      inertiaY: mass * 8,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
  };
}
