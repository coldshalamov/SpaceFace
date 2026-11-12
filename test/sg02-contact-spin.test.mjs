import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEntity } from '../src/core/entity.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { createBus } from '../src/core/eventBus.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const DT = 1 / 60;
const energy = rec => {
  const v = rec.body.linvel(), w = rec.body.angvel();
  return { linear: 0.5 * rec.body.mass() * (v.x ** 2 + v.z ** 2),
    angular: 0.5 * rec.body.principalInertia().y * w.y ** 2 };
};

async function contact({ loose = true, externalSpin = 0, includeWhip = false } = {}) {
  const previousCombat = { tumbleFling: COMBAT_FLAGS.tumbleFling,
    weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences };
  const previousMassline = { enabled: MASSLINE2_FLAGS.enabled, tumble: MASSLINE2_FLAGS.tumble };
  Object.assign(COMBAT_FLAGS, { tumbleFling: true, weaponImpulseConsequences: true });
  Object.assign(MASSLINE2_FLAGS, { enabled: true, tumble: true });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const player = makeEntity({ ...makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, pos: { x: 1000, z: 1000 }, team: 0 }), id: 1 });
  // The target is the actual starter hull, with its measured compound skin and derived inertia.
  const victim = makeEntity({ ...makeShipEntitySpec('ship_kestrel', {
    isPlayer: false, pos: { x: 0, z: 0 }, team: 1 }), id: 2 });
  const rock = makeEntity({ id: 3, type: 'asteroid', radius: 10, mass: 250,
    pos: { x: -100, z: 12 }, vel: { x: 100, z: 0 }, data: {} });
  const state = { mode: 'flight', tick: 0, simTime: 0, playerId: 1, meta: { seed: 4242 },
    player: includeWhip ? { tether: { active: true, targetId: 3 } } : {},
    entities: new Map([[1, player], [2, victim], [3, rock]]),
    entityList: [player, victim, rock], combat: { beams: [], threatTables: new Map() } };
  const bus = createBus();
  const helpers = { combatPhysics: { applyImpulse: args => owner.applyImpulse(args) } };
  const kernel = createCombatKernel({ state, bus, helpers, registry: { get: () => null } });
  const registry = { get: name => name === 'combat' ? { kernel } : null };
  const tumble = Object.create(tumbleStates);
  const collisions = Object.create(collisionConsequences);
  tumble.init({ state, bus, helpers, registry });
  collisions.init({ state, bus, helpers, registry });
  const announcements = [];
  bus.on('combat:tumbled', p => announcements.push(p));
  if (loose) {
    // A saved/ongoing tumble may have no entry spin left. The combat status is real; no
    // collision receipt, native motion, inertia or solver result is replaced by the fixture.
    tumble._scheduleTumbleStatus(victim, 4, {
      kind: 'massline_tumble', startedAt: 0, until: 4, chainCount: 0 });
    kernel.prePhysics(DT);
  }
  owner.syncFromEntities(state.entityList);
  const rec = owner.records.get(2), rockRec = owner.records.get(3);
  try {
    for (let tick = 1; tick <= 180; tick += 1) {
      state.tick = tick;
      state.simTime = tick * DT;
      writePhysicsControl(victim, { mode: loose ? 'tumbling' : 'assisted', source: 'contact-regression' });
      owner.step(DT);
      const receipts = owner.drainContactImpacts();
      const impact = receipts.find(r => r.aId === 2 && r.bId === 3);
      if (!impact) continue;
      const native = { spin: -rec.body.angvel().y, ...energy(rec) };
      const nativeVelocity = rec.body.linvel();
      // Deliver the actual native receipt at the same boundary/shape as physics.js. The
      // ordinary event consumer, combat status scheduler and physics command queue all run.
      if (includeWhip) {
        // Exercise the second real consumer at the confirmed native contact. Contact
        // detection itself is not the claim: this stages its receipt delivery boundary.
        const relativeSpeed = Math.hypot(rock.vel.x - victim.vel.x, rock.vel.z - victim.vel.z);
        masslineImpacts._emitImpact.call({ bus }, { impacts: [] }, state, state.simTime,
          rock, victim, relativeSpeed, Math.hypot(rock.vel.x, rock.vel.z), false);
      } else {
        bus.emit('physics:impact', { ...impact, backend: 'rapier-dynamic', tick: state.tick,
          dp: impact.impulse, consequenceKernelVersion: 1 });
      }
      bus.flush();
      if (externalSpin) queuePhysicsTorqueImpulse(victim, { y: rec.spec.inertiaY * externalSpin });
      let beforeNextSolve;
      const originalStep = owner.world.step;
      owner.world.step = function (...args) {
        beforeNextSolve = { spin: -rec.body.angvel().y, ...energy(rec), velocity: rec.body.linvel() };
        return originalStep.apply(this, args);
      };
      // Same native body and full fixed step: sample after queued impulses land, before
      // a second contact solve can add legitimate new momentum.
      owner.step(DT);
      owner.world.step = originalStep;
      return { loose, externalSpin, tick, mass: rec.body.mass(), inertia: rec.body.principalInertia().y,
        colliders: rec.colliders.length, rockMass: rockRec.body.mass(), rockInertia: rockRec.body.principalInertia().y,
        friction: rec.collider.friction(), restitution: rec.collider.restitution(),
        native, nativeVelocity, beforeNextSolve, announcements,
        playerSpin: player.angVel, playerVelocity: { x: player.vel.x, z: player.vel.z } };
    }
    assert.fail('the authored hull must reach an off-center native contact');
  } finally {
    collisions.destroy();
    tumble.destroy();
    owner.dispose();
    Object.assign(COMBAT_FLAGS, previousCombat);
    Object.assign(MASSLINE2_FLAGS, previousMassline);
  }
}

test('an already loose native hull keeps the solver angular response instead of receiving contact entry torque again', async t => {
  const result = await contact();
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.mass, 18);
  assert.ok(result.inertia > 650 && result.inertia < 850);
  assert.ok(result.colliders > 1);
  assert.ok(Math.abs(result.rockMass - 250) < 1e-3);
  assert.ok(result.native.spin < -0.5, 'the actual off-center solver contact already imparts yaw');
  assert.equal(result.announcements.length, 1, 'contact still updates the combat/control consequence');
  assert.equal(result.beforeNextSolve.velocity.x, result.nativeVelocity.x);
  assert.equal(result.beforeNextSolve.velocity.z, result.nativeVelocity.z);
  assert.ok(Math.abs(result.beforeNextSolve.spin - result.native.spin) < 1e-6,
    `contact must not be solved twice: native ${result.native.spin}, queued consumer ${result.beforeNextSolve.spin}`);
  assert.ok(Math.abs(result.beforeNextSolve.angular - result.native.angular) < 1e-3);
  assert.equal(result.playerSpin, 0);
  assert.deepEqual(result.playerVelocity, { x: 0, z: 0 });
});

test('a newly disabled helm still receives its authored entry spin', async () => {
  const result = await contact({ loose: false });
  assert.equal(result.announcements.length, 1);
  const entry = result.announcements[0];
  assert.ok(entry.spin > 0);
  assert.ok(Math.abs(result.beforeNextSolve.spin - entry.spin * entry.hitSide) < 1e-5);
});

test('a deliberate torque impulse still reaches an already loose hull', async () => {
  const result = await contact({ externalSpin: 0.25 });
  assert.ok(Math.abs(result.beforeNextSolve.spin - (result.native.spin + 0.25)) < 1e-5,
    'the contact fix preserves commanded angular impulse and its physical inertia conversion');
});

test('a solid Massline whip notification does not reapply native contact spin', async () => {
  const result = await contact({ includeWhip: true });
  assert.ok(result.announcements.some(p => p.source === 'rope_whip'),
    'the real solid-whip emitter reaches the legacy torque consumer');
  assert.ok(Math.abs(result.beforeNextSolve.spin - result.native.spin) < 1e-6);
});

