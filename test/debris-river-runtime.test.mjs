// PR95 Plan 19 — physical Debris River acceptance.
//
// The harness boots the production anomaly adapter, real Rapier owner, Mining, Cargo, and
// SaveSystem. Assertions follow the player route: collide/use wreckage as cover, beam finite
// salvage into a physical pickup, leave/re-enter, then Continue through the real save envelope.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import {
  ASHFALL_DEBRIS_RIVER,
  debrisRiverForSector,
} from '../src/data/anomalySites.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  anomalyRuntime,
  debrisRiverLedgerSnapshot,
} from '../src/systems/anomalyRuntime.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';

const RIVER = ASHFALL_DEBRIS_RIVER;

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function basis() {
  const start = sectorLocalToGlobalForSector(RIVER.start, RIVER.sectorId);
  const end = sectorLocalToGlobalForSector(RIVER.end, RIVER.sectorId);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  return { start, end, length, ux: dx / length, uz: dz / length };
}

function liveBodies(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.anomalySiteId === RIVER.id);
}

function ledgers(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'fx' && entity.data && entity.data.kind === 'anomaly_runtime_ledger'
    && entity.data.siteId === RIVER.id);
}

function finiteValue(state) {
  const snapshot = debrisRiverLedgerSnapshot(state);
  return snapshot
    ? Object.values(snapshot.bodies).reduce((sum, record) => sum
      + Object.values(record.pool || {}).reduce((subtotal, qty) => subtotal + qty, 0), 0)
    : 0;
}

async function boot(seed = 19019, sectorId = RIVER.sectorId) {
  const bus = createBus();
  const sim = createSimulation({
    seed,
    bus,
    systems: [anomalyRuntime, physics, mining, cargo, save],
    updateOrder: [anomalyRuntime, physics, mining, cargo, save],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 10_000;

  const line = basis();
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'player',
    pos: { x: line.start.x - 600, z: line.start.z - 600 },
    vel: { x: 0, z: 0 },
    radius: 7,
    mass: 90,
    hull: 300,
    hullMax: 300,
    collides: true,
    collisionMask: Masks.WRECK | Masks.PICKUP | Masks.PROJECTILE,
    flags: { persistent: true },
    physicsBody: {
      schemaVersion: 1,
      radius: 7,
      mass: 90,
      inertiaY: 2205,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { kind: 'player', isPlayer: true },
  });
  state.playerId = player.id;

  const events = {
    impacts: [],
    hits: [],
    yields: [],
    completed: [],
    collected: [],
    ordinaryRewards: [],
  };
  bus.on('physics:impact', (payload) => events.impacts.push(deepCopy(payload)));
  bus.on('projectile:hit', (payload) => events.hits.push(deepCopy(payload)));
  bus.on('mining:yield', (payload) => events.yields.push(deepCopy(payload)));
  bus.on('salvage:completed', (payload) => events.completed.push(deepCopy(payload)));
  bus.on('pickup:collected', (payload) => events.collected.push(payload));
  for (const event of ['loot:drop', 'economy:grantCredits', 'lootShards:spawn']) {
    bus.on(event, (payload) => events.ordinaryRewards.push({ event, payload: deepCopy(payload) }));
  }

  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true,
    'real rapier-dynamic authority starts');
  sim.runTicks(3);
  return { sim, bus, state, player, events, physicsOwner };
}

function dispose(route) {
  if (route.physicsOwner && typeof route.physicsOwner._disableSg02DynamicAuthority === 'function') {
    route.physicsOwner._disableSg02DynamicAuthority();
  }
  route.sim.dispose();
}

function poseFingerprint(state) {
  return liveBodies(state)
    .map((entity) => ({
      id: entity.data.anomalyBodyId,
      x: entity.pos.x,
      z: entity.pos.z,
      vx: entity.vel.x,
      vz: entity.vel.z,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

test('Debris River is one rare canonical site with bounded neutral Rapier wrecks', async () => {
  const admitted = SECTORS.filter((sector) => debrisRiverForSector(sector.id));
  assert.deepEqual(admitted.map((sector) => sector.id), [RIVER.sectorId],
    'exactly one sector in the graph admits the river');
  assert.ok(admitted.length < SECTORS.length / 2, 'one site is a minority-sector anomaly');
  assert.equal(debrisRiverForSector('sector_helios_prime'), null);

  const route = await boot();
  try {
    const bodies = liveBodies(route.state);
    assert.equal(bodies.length, RIVER.bodies.length, 'bounded authored body count materializes');
    assert.equal(new Set(bodies.map((entity) => entity.data.anomalyBodyId)).size, bodies.length,
      'one live physical body per stable authored identity');
    assert.equal(ledgers(route.state).length, 1, 'one hidden persistent custody ledger exists');
    assert.ok(bodies.every((entity) => entity.physicsBody && entity.physicsBody.dynamic === true),
      'every wreck is a real dynamic Rapier body');
    assert.ok(bodies.every((entity) => entity.collides
      && (entity.collisionMask & Masks.SHIP) !== 0
      && (entity.collisionMask & Masks.PROJECTILE) !== 0),
    'every wreck provides collision and projectile cover');
    assert.ok(bodies.every((entity) => entity.team !== 1
      && entity.data.worldSiteTargetable === false
      && entity.data.noOrdinaryRewards === true
      && entity.data.bountyCr === 0
      && entity.data.loot.length === 0),
    'river bodies are neutral texture, not target/HP/reward actors');
    assert.equal(route.state.player.targetId, null, 'river admission does not acquire a combat target');
  } finally {
    dispose(route);
  }
});

test('the authored line moves through Rapier, collides with the player, and catches a shot as cover', async () => {
  const route = await boot(19020);
  try {
    const first = liveBodies(route.state).find((entity) => entity.data.anomalyBodyId === 'keel');
    assert.ok(first);
    const before = { x: first.pos.x, z: first.pos.z };
    route.sim.runTicks(60);
    assert.ok(Math.hypot(first.pos.x - before.x, first.pos.z - before.z) > 10,
      'the dynamic body visibly advances along the authored line');

    route.player.pos.x = first.pos.x + basis().ux * 42;
    route.player.pos.z = first.pos.z + basis().uz * 42;
    route.player.prevPos.copy(route.player.pos);
    route.player.vel.x = -basis().ux * 100;
    route.player.vel.z = -basis().uz * 100;
    const closingVelocity = { x: route.player.vel.x, z: route.player.vel.z };
    assert.equal(await route.physicsOwner.prepareBackend(route.state, { reset: true }), true);
    let minDistance = Infinity;
    for (let i = 0; i < 90; i++) {
      route.sim.step(SIM_DT);
      minDistance = Math.min(minDistance, route.player.pos.distanceTo(first.pos));
    }
    assert.ok(minDistance <= route.player.radius + first.radius + 0.5,
      `the real bodies close to contact (min=${minDistance})`);
    assert.ok(Math.hypot(
      route.player.vel.x - closingVelocity.x,
      route.player.vel.z - closingVelocity.z,
    ) > 1, 'Rapier contact materially changes the player body velocity');

    const cover = liveBodies(route.state).find((entity) => entity.data.anomalyBodyId === 'plate');
    assert.ok(cover);
    const projectile = route.sim.spawn({
      type: 'projectile',
      team: 0,
      ownerId: route.player.id,
      pos: {
        x: cover.pos.x - basis().ux * 90,
        z: cover.pos.z - basis().uz * 90,
      },
      vel: { x: basis().ux * 720, z: basis().uz * 720 },
      radius: 1,
      mass: 0.2,
      ttl: 1,
      collides: true,
      collisionMask: Masks.WRECK,
      physicsBody: {
        schemaVersion: 1,
        radius: 1,
        mass: 0.2,
        inertiaY: 0.1,
        dynamic: true,
        ccd: true,
        material: 'projectile',
        revision: 0,
      },
      data: { kind: 'debris_cover_probe', damage: 1 },
    });
    for (let i = 0; i < 30 && projectile.alive; i++) route.sim.step(SIM_DT);
    assert.ok(route.events.hits.some((event) => event.targetId === cover.id),
      'ordinary projectile sweep stops on the moving cover body');
    assert.equal(projectile.alive, false, 'the covered shot is physically consumed');
  } finally {
    dispose(route);
  }
});

test('same seed rematerializes the same moving line without duplicate bodies or value', async () => {
  const first = await boot(19021);
  const repeat = await boot(19021);
  try {
    first.sim.runTicks(90);
    repeat.sim.runTicks(90);
    assert.deepEqual(poseFingerprint(first.state), poseFingerprint(repeat.state),
      'same seed and inputs reproduce exact Rapier poses');
    assert.equal(finiteValue(first.state), finiteValue(repeat.state));
    assert.equal(ledgers(first.state).length, 1);
    assert.equal(ledgers(repeat.state).length, 1);
  } finally {
    dispose(first);
    dispose(repeat);
  }
});

test('real Mining/Cargo depletion survives re-entry and Continue without minting a second pool', async () => {
  const route = await boot(19022);
  try {
    const initialValue = finiteValue(route.state);
    const target = liveBodies(route.state).find((entity) => entity.data.anomalyBodyId === 'spar');
    assert.ok(target);
    route.player.pos.copy(target.pos);
    route.player.prevPos.copy(target.pos);
    route.player.vel.set(0, 0, 0);

    const miningOwner = route.sim.registry.get('mining');
    miningOwner._drainWreck(route.player, target, 18, 6);
    assert.equal(route.events.yields.length, 1, 'real Mining emits the finite wreck yield');
    assert.equal(route.events.completed.length, 1, 'real Mining completes the one-unit wreck');
    assert.equal(finiteValue(route.state), initialValue - 1, 'custody ledger loses exactly the mined unit');

    const pickup = route.state.entityList.find((entity) => entity && entity.alive !== false
      && entity.type === 'pickup' && entity.data && entity.data.commodityId === 'cmdty_scrap_metal');
    assert.ok(pickup, 'Mining materializes the existing physical salvage pickup');
    route.player.pos.copy(pickup.pos);
    route.player.prevPos.copy(pickup.pos);
    route.physicsOwner.collectPickups(route.state);
    assert.equal(route.state.player.cargo.items.cmdty_scrap_metal, 1,
      'physical pickup acceptance writes through Cargo');
    assert.ok(route.events.collected.some((event) => event.pickupId === pickup.id
      && event.collectorId === route.state.playerId));
    assert.deepEqual(route.events.ordinaryRewards, [], 'no kill, credit, shard, or parallel reward route fires');

    route.state.world.currentSectorId = 'sector_helios_prime';
    route.bus.emit('sector:exit', { sectorId: RIVER.sectorId });
    route.sim.step(SIM_DT);
    assert.equal(liveBodies(route.state).length, 0, 'sector exit removes transient physical bodies');
    assert.equal(ledgers(route.state).length, 1, 'finite custody remains durable outside the sector');

    route.state.world.currentSectorId = RIVER.sectorId;
    route.sim.step(SIM_DT);
    assert.equal(liveBodies(route.state).length, RIVER.bodies.length - 1,
      're-entry rematerializes only undepleted identities');
    assert.equal(liveBodies(route.state).some((entity) => entity.data.anomalyBodyId === 'spar'), false);
    assert.equal(finiteValue(route.state), initialValue - 1);
    assert.equal(new Set(liveBodies(route.state).map((entity) => entity.data.anomalyBodyId)).size,
      RIVER.bodies.length - 1, 're-entry creates no duplicate bodies');

    const beforeContinue = debrisRiverLedgerSnapshot(route.state);
    const saveOwner = route.sim.registry.get('save');
    const envelope = saveOwner.serialize('plan19-debris-river');
    assert.equal(saveOwner.loadEnvelope(deepCopy(envelope), 'plan19-debris-river'), true,
      'real Continue succeeds with the finite river ledger in the envelope');
    assert.deepEqual(debrisRiverLedgerSnapshot(route.state), beforeContinue,
      'Continue restores the exact stable identities, pose, pools, and depleted record before play resumes');
    assert.equal(await route.physicsOwner.prepareBackend(route.state), true,
      'Continue re-establishes Rapier authority');
    route.sim.runTicks(2);

    const afterContinue = debrisRiverLedgerSnapshot(route.state);
    for (const definition of RIVER.bodies) {
      assert.deepEqual(afterContinue.bodies[definition.id].pool, beforeContinue.bodies[definition.id].pool,
        `${definition.id} resumes with the same finite salvage custody`);
      assert.equal(afterContinue.bodies[definition.id].depleted,
        beforeContinue.bodies[definition.id].depleted,
        `${definition.id} resumes with the same depletion state`);
      assert.equal(afterContinue.bodies[definition.id].laps, beforeContinue.bodies[definition.id].laps,
        `${definition.id} resumes without an invented lap`);
    }
    assert.equal(liveBodies(route.state).length, RIVER.bodies.length - 1);
    assert.equal(liveBodies(route.state).some((entity) => entity.data.anomalyBodyId === 'spar'), false,
      'depleted wreck never returns after Continue');
    assert.equal(ledgers(route.state).length, 1, 'Continue adopts one ledger without duplication');
    assert.equal(finiteValue(route.state), initialValue - 1, 'Continue cannot mint salvage value');
  } finally {
    dispose(route);
  }
});
