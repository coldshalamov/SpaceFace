import assert from 'node:assert/strict';
import test from 'node:test';

import { couplingScale } from '../src/core/fields/fieldKernel.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createBus } from '../src/core/eventBus.js';
import { FIELD_COUPLING } from '../src/data/fields.js';
import { fieldBodyProfile, fields } from '../src/systems/fields.js';

const DT = 1 / 60;

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
