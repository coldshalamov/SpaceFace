import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import {
  MEDIUM_RUNTIME_TUNING,
  mediumEnemyRuntime,
} from '../src/systems/mediumEnemyRuntime.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';

const DT = 1 / 60;

function enemySpec(typeId, x, z, team = 1) {
  const spec = makeEnemySpawnSpec(typeId, 1, { x, z });
  spec.team = team;
  spec.factionId = team === 1 ? 'faction_reach' : 'faction_free';
  if (team === 0) {
    spec.data.lootTableId = 'route_player';
    spec.data.enemyTypeId = null;
  }
  return spec;
}

function boot({ withPhysics = false, seed = 1300 } = {}) {
  const systems = withPhysics
    ? [physics, actions, mediumEnemyRuntime, combat]
    : [actions, mediumEnemyRuntime, combat];
  const updateOrder = withPhysics
    ? [actions, physics, mediumEnemyRuntime, combat]
    : [actions, mediumEnemyRuntime, combat];
  const sim = createSimulation({ seed, bus: createBus(), systems, updateOrder });
  sim.state.mode = 'flight';
  const player = sim.spawn(enemySpec('hostile_interceptor', -500, 0, 0));
  sim.state.playerId = player.id;
  return { sim, player, combat: sim.registry.get('combat'), physics: sim.registry.get('physics') };
}

async function preparePhysics(harness) {
  harness.sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await harness.physics.prepareBackend(harness.sim.state), true,
    'real rapier-dynamic physics authority starts');
}

function cleanup(harness) {
  if (harness.physics && typeof harness.physics._disableSg02DynamicAuthority === 'function') {
    harness.physics._disableSg02DynamicAuthority();
  }
  harness.sim.dispose();
}

function routeHit(harness, target, options = {}) {
  const damage = Number(options.damage) || 0;
  return harness.combat.ensureKernel().routeDamage({
    attackerId: harness.player.id,
    targetId: target.id,
    origin: {
      kind: 'weapon',
      id: options.weaponId || 'wpn_autocannon_m',
      weaponId: options.weaponId || 'wpn_autocannon_m',
    },
    packet: {
      channels: options.channels || { kinetic: damage },
      shieldBypass: options.shieldBypass || 0,
      subsystemShare: options.subsystemShare == null ? null : options.subsystemShare,
      hit: {
        pos: { x: target.pos.x, z: target.pos.z },
        ...(options.subsystemId ? { subsystemId: options.subsystemId } : {}),
      },
      impulse: options.impulse || null,
      source: {
        kind: 'weapon',
        weaponId: options.weaponId || 'wpn_autocannon_m',
      },
    },
  });
}

function damagePulsesToKill(harness, target, damage = 24) {
  let pulses = 0;
  while (target.alive !== false && pulses < 40) {
    routeHit(harness, target, { damage });
    harness.sim.step(DT);
    pulses++;
  }
  assert.equal(target.alive, false, 'route reaches a real combat kill');
  return pulses;
}

function spawnBulwarkWing(harness) {
  const bulwark = harness.sim.spawn(enemySpec('bulwark_escort', 0, 0));
  const wing = harness.sim.spawn(enemySpec('hostile_interceptor', 110, 0));
  harness.sim.step(DT);
  return { bulwark, wing };
}

test('production manifest places the medium runtime after physics and before combat', () => {
  const initIndex = PRODUCTION_INIT_ORDER.indexOf('mediumEnemyRuntime');
  const updateIndex = PRODUCTION_UPDATE_ORDER.indexOf('mediumEnemyRuntime');
  assert.ok(initIndex >= 0 && updateIndex >= 0);
  assert.ok(initIndex < PRODUCTION_INIT_ORDER.indexOf('combat'));
  assert.equal(PRODUCTION_UPDATE_ORDER[updateIndex - 1], 'physics');
  assert.equal(PRODUCTION_UPDATE_ORDER[updateIndex + 1], 'combat');
  assert.strictEqual(getNodeSystemFactoryTable().get('mediumEnemyRuntime'), mediumEnemyRuntime);
});

test('Bulwark projection is real damage authority and EMP stripping is meaningfully faster than naive fire', () => {
  const naive = boot({ seed: 1301 });
  let naivePulses;
  try {
    const { bulwark, wing } = spawnBulwarkWing(naive);
    const links = naive.sim.state.mediumEnemyRuntime.bulwarkLinksByTarget;
    assert.equal(links[String(wing.id)]?.sourceId, bulwark.id);
    const beforeProjector = bulwark.shield;
    const receipt = routeHit(naive, wing, { damage: 24 });
    assert.equal(receipt.projectedById, bulwark.id);
    assert.ok(receipt.projectedShieldDamage > 0);
    assert.equal(wing.shield, wing.shieldMax, 'wing shield is untouched while the upstream pool holds');
    assert.ok(bulwark.shield < beforeProjector, 'the damage router depleted the real projector shield');
    naivePulses = 1 + damagePulsesToKill(naive, wing, 24);
  } finally {
    cleanup(naive);
  }

  const intended = boot({ seed: 1301 });
  let intendedPulses;
  try {
    const { bulwark, wing } = spawnBulwarkWing(intended);
    const emp = routeHit(intended, bulwark, {
      channels: { ion: 400 },
      shieldBypass: 1,
      subsystemShare: 1,
      subsystemId: 'subsystem_power',
      weaponId: 'wpn_emp_disruptor_m',
    });
    assert.equal(emp.subsystemId, 'subsystem_power');
    assert.ok(emp.subsystemDamage > 0, 'EMP crosses the shared subsystem damage route');
    intended.sim.step(DT); // combat applies the pending power transition
    intended.sim.step(DT); // medium runtime observes that transition and breaks the link
    assert.equal(intended.sim.state.mediumEnemyRuntime.bulwarkLinksByTarget[String(wing.id)], undefined);
    intendedPulses = 1 + damagePulsesToKill(intended, wing, 24); // include the EMP setup pulse
  } finally {
    cleanup(intended);
  }

  assert.ok(intendedPulses <= Math.floor(naivePulses * 0.65),
    `EMP setup is materially faster: intended=${intendedPulses}, naive=${naivePulses}`);
});

test('a real physics impulse can vector-separate the Bulwark and physically break its link', async () => {
  const harness = boot({ withPhysics: true, seed: 1302 });
  await preparePhysics(harness);
  try {
    const { bulwark, wing } = spawnBulwarkWing(harness);
    const breaks = [];
    harness.sim.bus.on('medium:bulwarkLink', (payload) => {
      if (payload.active === false) breaks.push(payload);
    });
    const impulse = routeHit(harness, bulwark, { impulse: { x: -18000, z: 0 } });
    assert.equal(impulse.impulseApplied, true, 'impulse crossed combat into SG-02');
    for (let tick = 0; tick < 90; tick++) harness.sim.step(DT);
    assert.ok(Math.hypot(bulwark.pos.x - wing.pos.x, bulwark.pos.z - wing.pos.z)
      > MEDIUM_RUNTIME_TUNING.bulwarkLinkRange);
    assert.equal(harness.sim.state.mediumEnemyRuntime.bulwarkLinksByTarget[String(wing.id)], undefined);
    assert.ok(breaks.some((payload) => payload.reason === 'physical_separation'));
  } finally {
    cleanup(harness);
  }
});

async function torcherKillRoute({ intended, seed }) {
  const harness = boot({ withPhysics: true, seed });
  await preparePhysics(harness);
  try {
    const torcher = harness.sim.spawn(enemySpec('torcher_denial', 0, 0));
    harness.sim.step(DT);
    const selfHits = [];
    const kills = [];
    harness.sim.bus.on('medium:torcherTrailHit', (payload) => {
      if (payload.targetId === torcher.id && payload.selfCrossing) selfHits.push(payload);
    });
    harness.sim.bus.on('entity:killed', (payload) => {
      if (payload.id === torcher.id) kills.push(payload);
    });

    if (intended) {
      assert.equal(routeHit(harness, torcher, { impulse: { x: 5200, z: 0 } }).impulseApplied, true);
      for (let tick = 0; tick < 150; tick++) {
        harness.sim.step(DT);
        if (harness.sim.state.mediumEnemyRuntime.torcherTrails.some((trail) => trail.ownerArmed)) break;
      }
      const trail = harness.sim.state.mediumEnemyRuntime.torcherTrails[0];
      assert.ok(trail && trail.ownerArmed, 'outbound physical movement leaves and arms a bounded trail');
      assert.equal(routeHit(harness, torcher, { impulse: { x: -10400, z: 0 } }).impulseApplied, true);
      for (let tick = 0; tick < 180; tick++) {
        harness.sim.step(DT);
        const distance = Math.hypot(torcher.pos.x - trail.center.x, torcher.pos.z - trail.center.z);
        if (distance < 12) {
          const stop = harness.sim.helpers.combatPhysics.applyImpulse({
            entityId: torcher.id,
            impulse: { x: -torcher.vel.x * torcher.mass, z: -torcher.vel.z * torcher.mass },
            reason: 'route_vector_brake',
            tick: harness.sim.state.tick,
          });
          assert.notEqual(stop, false, 'counter controller brakes through the real physics port');
          harness.sim.step(DT);
          break;
        }
      }
      assert.ok(Math.hypot(torcher.pos.x - trail.center.x, torcher.pos.z - trail.center.z) < trail.radius,
        'the displaced Torcher physically occupies its own armed trail');
    }

    let ticks = 0;
    while (torcher.alive !== false && ticks < 1200) {
      if (ticks % 12 === 0) routeHit(harness, torcher, { damage: 5 });
      harness.sim.step(DT);
      ticks++;
    }
    assert.equal(torcher.alive, false, 'the route terminates in the real combat owner');
    assert.equal(kills.at(-1)?.killerId, harness.player.id,
      'the Torcher self-crossing retains the player who supplied the physical counter setup');
    return { ticks, selfHits: selfHits.length };
  } finally {
    cleanup(harness);
  }
}

test('baiting and displacing a Torcher through its persistent trail kills meaningfully faster than naive fire', async () => {
  const intended = await torcherKillRoute({ intended: true, seed: 1303 });
  const naive = await torcherKillRoute({ intended: false, seed: 1303 });
  assert.ok(intended.selfHits >= 2, 'the real trail applies repeated self-crossing damage pulses');
  assert.ok(intended.ticks <= Math.floor(naive.ticks * 0.7),
    `trail setup is materially faster after engagement: intended=${intended.ticks}, naive=${naive.ticks}`);
});

test('the same Torcher trail is a real area-denial hazard to the player', () => {
  const harness = boot({ seed: 13035 });
  try {
    const torcher = harness.sim.spawn(enemySpec('torcher_denial', 0, 0));
    harness.sim.step(DT);
    torcher.pos.x = MEDIUM_RUNTIME_TUNING.torcherTrailSpacing + 20;
    harness.sim.step(DT);
    const trail = harness.sim.state.mediumEnemyRuntime.torcherTrails[0];
    assert.ok(trail && trail.ownerArmed);
    const before = harness.player.shield + harness.player.armorHp + harness.player.hull;
    harness.player.pos.x = trail.center.x;
    harness.player.pos.z = trail.center.z;
    harness.sim.step(DT);
    const after = harness.player.shield + harness.player.armorHp + harness.player.hull;
    assert.ok(after < before, 'player damage crosses the same combat router as Torcher self-damage');
  } finally {
    cleanup(harness);
  }
});

test('Torcher trails and Bulwark links are bounded, deterministic, and cleared at lifecycle boundaries', () => {
  const first = boot({ seed: 1304 });
  const snapshot = [];
  try {
    const bulwark = first.sim.spawn(enemySpec('bulwark_escort', 0, 0));
    for (let index = 0; index < 6; index++) first.sim.spawn(enemySpec('hostile_interceptor', 40 + index * 30, 0));
    const torcher = first.sim.spawn(enemySpec('torcher_denial', 0, 500));
    first.sim.step(DT);
    for (let index = 1; index <= 20; index++) {
      torcher.pos.x = index * MEDIUM_RUNTIME_TUNING.torcherTrailSpacing;
      first.sim.step(DT);
    }
    const runtime = first.sim.state.mediumEnemyRuntime;
    assert.equal(Object.keys(runtime.bulwarkLinksByTarget).length, MEDIUM_RUNTIME_TUNING.bulwarkMaxLinks);
    assert.ok(runtime.torcherTrails.length <= MEDIUM_RUNTIME_TUNING.torcherTrailMaxPerSource);
    snapshot.push(...runtime.torcherTrails.map((trail) => [trail.center.x, trail.center.z, trail.expiresAt]));
    assert.ok(bulwark.alive && torcher.alive);
    first.sim.bus.emit('save:loaded', {});
    assert.deepEqual(first.sim.state.mediumEnemyRuntime.torcherTrails, []);
    assert.deepEqual(first.sim.state.mediumEnemyRuntime.bulwarkLinksByTarget, {});
  } finally {
    cleanup(first);
  }

  const repeat = boot({ seed: 1304 });
  try {
    repeat.sim.spawn(enemySpec('bulwark_escort', 0, 0));
    for (let index = 0; index < 6; index++) repeat.sim.spawn(enemySpec('hostile_interceptor', 40 + index * 30, 0));
    const torcher = repeat.sim.spawn(enemySpec('torcher_denial', 0, 500));
    repeat.sim.step(DT);
    for (let index = 1; index <= 20; index++) {
      torcher.pos.x = index * MEDIUM_RUNTIME_TUNING.torcherTrailSpacing;
      repeat.sim.step(DT);
    }
    assert.deepEqual(
      repeat.sim.state.mediumEnemyRuntime.torcherTrails.map((trail) => [trail.center.x, trail.center.z, trail.expiresAt]),
      snapshot,
    );
  } finally {
    cleanup(repeat);
  }
});
