import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { mulberry32 } from '../src/core/rng.js';
import {
  SWARM_DROP_KIND,
  SWARM_DROP_INTERVAL,
  SWARM_DROP_MAX_LIVE,
  SWARM_DROP_TTL_S,
  SWARM_DROP_DEFS,
  SWARM_DROP_BY_ID,
  selectSwarmDrop,
} from '../src/data/swarmDrops.js';
import { swarmDrops } from '../src/systems/swarmDrops.js';

const SEED = 4242;
const ARENA = 'helios_core';
const HULL_MAX = 200;

function boot({ ruleset = SWARM_RULESET, hull = HULL_MAX, seed = SEED } = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  const emitted = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) {
      emitted.push({ event, payload });
      bus.emit(event, payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { ...spec.pos } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      wrapped.emit('entity:spawned', { id, type: entity.type, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) {
        entity.alive = false;
        state.entities.delete(id);
        const idx = state.entityList.indexOf(entity);
        if (idx !== -1) state.entityList.splice(idx, 1);
        wrapped.emit('entity:destroyed', { id, entity });
      }
    },
  };
  const player = {
    id: state.nextEntityId++,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    type: 'ship',
    hull,
    hullMax: HULL_MAX,
    data: {
      weapons: [
        { id: 'wpn_test_1', ammo: 5, ammoMax: 30, _heat: 45, _cooldown: 1.2, impulsePerHit: 500 },
        { id: 'wpn_test_2', ammo: 0, ammoMax: 10, _heat: 80, _cooldown: 2.0, impulsePerHit: 300 },
      ],
      weaponVentUntil: 105,
      weaponVenting: true,
    },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 100;
  state.tick = 6000;

  const ctx = { state, bus: wrapped, helpers };
  runSession.init(ctx);
  swarmDrops.init(ctx);
  wrapped.emit('run:beginRequested', { kind: 'survival', ruleset, seed, arenaId: ARENA });

  return { state, bus: wrapped, emitted, helpers, player, ctx };
}

let bodyN = 0;
function killCohortBody(h, { cohort = SURVIVAL_COHORT_TAG, killerId = null, pos = null } = {}) {
  const id = h.state.nextEntityId++;
  const victim = {
    id,
    alive: true,
    type: 'ship',
    pos: pos || { x: 30 + (bodyN++ % 7), z: -10 },
    vel: { x: 4, z: 0 },
    data: cohort ? { runCohort: cohort } : {},
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id,
    killerId: killerId == null ? h.state.playerId : killerId,
    type: 'ship',
    pos: { ...victim.pos },
    victim,
  });
  return victim;
}

function getLiveDrops(h) {
  return h.state.entityList.filter(
    (e) => e.alive !== false && e.type === 'pickup' && e.data && e.data.kind === SWARM_DROP_KIND,
  );
}

function scoopDrop(h, drop) {
  h.bus.emit('pickup:collected', {
    pickupId: drop.id,
    collectorId: h.state.playerId,
    kind: drop.data?.kind,
    pos: { ...drop.pos },
  });
}

// -----------------------------------------------------------------------------
// 1. Drop cadence & limits
// -----------------------------------------------------------------------------

test('drop cadence: drops occur at most 1 per 12 kills', () => {
  const h = boot();
  assert.equal(swarmDrops.killsSinceDrop(), 0);

  // 11 kills: no drop
  for (let i = 0; i < SWARM_DROP_INTERVAL - 1; i++) {
    killCohortBody(h);
  }
  assert.equal(getLiveDrops(h).length, 0);
  assert.equal(swarmDrops.killsSinceDrop(), 11);

  // 12th kill: exactly one drop
  const corpse = killCohortBody(h, { pos: { x: 50, z: -20 } });
  const drops = getLiveDrops(h);
  assert.equal(drops.length, 1);
  assert.equal(swarmDrops.killsSinceDrop(), 0);

  const drop = drops[0];
  assert.equal(drop.type, 'pickup');
  assert.equal(drop.data.kind, SWARM_DROP_KIND);
  assert.ok(drop.data.swarmDrop);
  assert.ok(drop.data.tetherable);
  assert.ok(drop.data.masslineTetherable);
  assert.ok(Math.hypot(drop.pos.x - corpse.pos.x, drop.pos.z - corpse.pos.z) < 1e-3);
});

test('drop cap: at most 2 drops alive at once on the board', () => {
  const h = boot();

  // First 12 kills -> 1st drop
  for (let i = 0; i < SWARM_DROP_INTERVAL; i++) killCohortBody(h);
  assert.equal(getLiveDrops(h).length, 1);

  // Next 12 kills -> 2nd drop
  for (let i = 0; i < SWARM_DROP_INTERVAL; i++) killCohortBody(h);
  assert.equal(getLiveDrops(h).length, 2);

  // Next 12 kills (24 more kills) -> still capped at 2 drops
  for (let i = 0; i < SWARM_DROP_INTERVAL * 2; i++) killCohortBody(h);
  assert.equal(getLiveDrops(h).length, 2, 'capped at max 2 live drops');

  // Collect one drop
  const live = getLiveDrops(h);
  scoopDrop(h, live[0]);
  assert.equal(getLiveDrops(h).length, 1);

  // Next 12 kills -> can drop again now that slot is free
  for (let i = 0; i < SWARM_DROP_INTERVAL; i++) killCohortBody(h);
  assert.equal(getLiveDrops(h).length, 2);
});

test('drop TTL: unclaimed drops despawn after 12 seconds', () => {
  const h = boot();
  h.state.simTime = 100;

  for (let i = 0; i < SWARM_DROP_INTERVAL; i++) killCohortBody(h);
  const drops = getLiveDrops(h);
  assert.equal(drops.length, 1);
  const drop = drops[0];
  assert.equal(drop.data.despawnAt, 100 + SWARM_DROP_TTL_S);

  // Advance time by 6s and tick
  h.state.simTime = 106;
  swarmDrops.update(1);
  assert.equal(getLiveDrops(h).length, 1, 'still alive at 6s');

  // Advance past TTL (112.1s) and tick
  h.state.simTime = 112.1;
  swarmDrops.update(1);
  assert.equal(getLiveDrops(h).length, 0, 'despawned after TTL');
});

// -----------------------------------------------------------------------------
// 2. Drop selection & determinism
// -----------------------------------------------------------------------------

test('drop selection determinism: same seed yields same sequence of drops', () => {
  const seed = 998877;
  const rng1 = mulberry32(seed);
  const rng2 = mulberry32(seed);

  const seq1 = Array.from({ length: 20 }, () => selectSwarmDrop(rng1).id);
  const seq2 = Array.from({ length: 20 }, () => selectSwarmDrop(rng2).id);
  assert.deepEqual(seq1, seq2, 'mulberry32 seeded rng produces deterministic drop sequence');
});

test('free_forge has 1/4 weight compared to standard drops', () => {
  const freeForge = SWARM_DROP_BY_ID.get('free_forge');
  assert.ok(freeForge);
  assert.equal(freeForge.weight, 0.25);

  const standardDrops = SWARM_DROP_DEFS.filter((d) => d.id !== 'free_forge');
  assert.equal(standardDrops.length, 7);
  for (const d of standardDrops) {
    assert.equal(d.weight, 1.0);
  }
});

// -----------------------------------------------------------------------------
// 3. Drop effects
// -----------------------------------------------------------------------------

test('effect: full_rack refills weapons heat/cooldown/ammo, clears vent, resets power cooldowns', () => {
  const h = boot();
  h.state.fields = { cooldowns: { shove: 4.5, aegis: 12.0 } };
  h.state.player = { massSeed: { cooldownUntil: 150 } };
  h.state.bombs = { cooldownUntil: 140, cooldowns: { cluster: 8 } };
  h.player.cargo = {};

  // Force spawn full_rack
  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 10, z: 10 },
    data: { kind: SWARM_DROP_KIND, dropId: 'full_rack', swarmDropIndex: 1 },
  });

  scoopDrop(h, drop);

  // Weapons check
  for (const w of h.player.data.weapons) {
    assert.equal(w._cooldown, 0);
    assert.equal(w._heat, 0);
    assert.equal(w.ammo, w.ammoMax);
  }
  assert.equal(h.player.data.weaponVentUntil, undefined);
  assert.equal(h.player.data.weaponVenting, undefined);

  // Power cooldowns check
  assert.equal(h.state.fields.cooldowns.shove, 0);
  assert.equal(h.state.fields.cooldowns.aegis, 0);
  assert.equal(h.state.player.massSeed.cooldownUntil, 0);
  assert.equal(h.state.bombs.cooldownUntil, 0);
  assert.equal(h.state.bombs.cooldowns.cluster, 0);
});

test('effect: heavy_hands doubles weapon impulse for 20s and reverts', () => {
  const h = boot();
  h.state.simTime = 100;

  const initialImpulse0 = h.player.data.weapons[0].impulsePerHit;
  const initialImpulse1 = h.player.data.weapons[1].impulsePerHit;

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 10, z: 10 },
    data: { kind: SWARM_DROP_KIND, dropId: 'heavy_hands', swarmDropIndex: 2 },
  });
  scoopDrop(h, drop);

  assert.equal(swarmDrops.isHeavyHandsActive(), true);
  assert.equal(h.player.data.weapons[0].impulsePerHit, initialImpulse0 * 2);
  assert.equal(h.player.data.weapons[1].impulsePerHit, initialImpulse1 * 2);

  // Advance time by 10s -> still active
  h.state.simTime = 110;
  swarmDrops.update(1);
  assert.equal(swarmDrops.isHeavyHandsActive(), true);
  assert.equal(h.player.data.weapons[0].impulsePerHit, initialImpulse0 * 2);

  // Advance past 20s -> reverts
  h.state.simTime = 120.1;
  swarmDrops.update(1);
  assert.equal(swarmDrops.isHeavyHandsActive(), false);
  assert.equal(h.player.data.weapons[0].impulsePerHit, initialImpulse0);
  assert.equal(h.player.data.weapons[1].impulsePerHit, initialImpulse1);
});

test('effect: dead_weight kills light/medium enemy, deals 60% max hull to heavy, expires in 20s', () => {
  const h = boot();
  h.state.simTime = 100;

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 10, z: 10 },
    data: { kind: SWARM_DROP_KIND, dropId: 'dead_weight', swarmDropIndex: 3 },
  });
  scoopDrop(h, drop);
  assert.equal(swarmDrops.isDeadWeightActive(), true);

  // Throw a rock
  const rock = h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    mass: 20,
  });
  h.bus.emit('massline:throw', { payloadId: rock.id });

  // Light enemy
  const lightEnemy = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 20, z: 0 },
    hull: 80,
    hullMax: 80,
    data: { shipClass: 'fighter' },
  });

  // Collision between thrown rock and light enemy
  h.bus.emit('combat:collisionConsequence', { targetId: lightEnemy.id, otherId: rock.id });
  assert.equal(lightEnemy.alive, false, 'light enemy killed outright');
  assert.equal(lightEnemy.hull, 0);

  // Throw another rock at a heavy ship
  const rock2 = h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    mass: 20,
  });
  h.bus.emit('massline:throw', { payloadId: rock2.id });

  const heavyEnemy = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 40, z: 0 },
    hull: 500,
    hullMax: 500,
    data: { shipClass: 'capital' },
  });

  h.bus.emit('physics:impact', { aId: rock2.id, bId: heavyEnemy.id });
  // Heavy takes 60% of max hull (300 damage), so 500 - 300 = 200 hull remaining
  assert.equal(heavyEnemy.hull, 200, 'heavy enemy took 60% max hull damage');
  assert.equal(heavyEnemy.alive, true);

  // Expiration after 20s
  h.state.simTime = 120.1;
  swarmDrops.update(1);
  assert.equal(swarmDrops.isDeadWeightActive(), false);
});

test('effect: magnet pulls floor scrap and credit pickups toward player', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };
  h.player.vel = { x: 0, z: 0 };

  const scrap = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 300, z: 0 },
    data: { kind: 'ore_chunk', label: 'Scrap' },
  });
  const credit = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 400 },
    data: { kind: 'credit_chip', label: 'Credits' },
  });
  const dropItem = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 100, z: 100 },
    data: { kind: SWARM_DROP_KIND, dropId: 'magnet', swarmDropIndex: 4 },
  });

  scoopDrop(h, dropItem);

  assert.equal(scrap.data.magnetPull, true);
  assert.ok(scrap.vel.x < 0, 'scrap velocity directed toward player x=0');
  assert.equal(credit.data.magnetPull, true);
  assert.ok(credit.vel.z < 0, 'credit velocity directed toward player z=0');
});

test('effect: big_bang applies radial impulse within arena radius and shakes camera', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };

  const nearbyShip = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 100, z: 0 },
    mass: 10,
  });
  const farShip = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 1500, z: 0 },
    mass: 10,
  });

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'big_bang', swarmDropIndex: 5 },
  });

  scoopDrop(h, drop);

  assert.ok(nearbyShip.vel.x > 0, 'nearby ship pushed outward');
  assert.equal(farShip.vel, undefined, 'ship beyond arena radius untouched');

  const shakeEvent = h.emitted.find((e) => e.event === 'camera:shake');
  assert.ok(shakeEvent, 'camera:shake emitted');
  assert.equal(shakeEvent.payload.amount, 0.8);
});

test('effect: double_scrap doubles earnings for 30s and reverts', () => {
  const h = boot();
  h.state.simTime = 100;

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'double_scrap', swarmDropIndex: 6 },
  });
  scoopDrop(h, drop);
  assert.equal(swarmDrops.isDoubleScrapActive(), true);

  // Trigger an award request
  h.bus.emit('run:awardRequested', { credits: 75, reason: 'kill_streak', wave: 1 });

  const bonusAwards = h.emitted.filter(
    (e) => e.event === 'run:awardRequested' && e.payload.reason === 'swarm:doubleScrapBonus',
  );
  assert.equal(bonusAwards.length, 1);
  assert.equal(bonusAwards[0].payload.credits, 75);

  // Expiration after 30s
  h.state.simTime = 130.1;
  swarmDrops.update(1);
  assert.equal(swarmDrops.isDoubleScrapActive(), false);

  // Subsequent awards should not trigger bonus
  h.bus.emit('run:awardRequested', { credits: 50, reason: 'kill', wave: 1 });
  const bonusAwards2 = h.emitted.filter(
    (e) => e.event === 'run:awardRequested' && e.payload.reason === 'swarm:doubleScrapBonus',
  );
  assert.equal(bonusAwards2.length, 1, 'no extra bonus after expiry');
});

test('effect: loose_cannon spawns tetherable auto-turret, fires at enemy, expires after 60s', () => {
  const h = boot();
  h.state.simTime = 100;

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'loose_cannon', swarmDropIndex: 7 },
  });
  scoopDrop(h, drop);

  assert.equal(swarmDrops.activeTurretCount(), 1);
  const turret = h.state.entityList.find((e) => e.data?.looseCannon);
  assert.ok(turret, 'turret exists in entity list');
  assert.equal(turret.tetherable, true);
  assert.equal(turret.data.masslineTetherable, true);
  assert.equal(turret.data.despawnAt, 160);

  // Spawn an enemy in range
  const enemy = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: turret.pos.x + 100, z: turret.pos.z },
    team: 'hostile',
  });

  // Tick at 100.6 (fire interval 0.5s passed)
  h.state.simTime = 100.6;
  swarmDrops.update(0.6);

  const firedEvent = h.emitted.find((e) => e.event === 'combat:fire' && e.payload.ownerId === turret.id);
  assert.ok(firedEvent, 'combat:fire emitted from loose cannon turret');

  const proj = h.state.entityList.find((e) => e.type === 'projectile' && e.ownerId === turret.id);
  assert.ok(proj, 'projectile spawned from loose cannon turret');

  // Advance time past 60s
  h.state.simTime = 160.1;
  swarmDrops.update(1);
  assert.equal(swarmDrops.activeTurretCount(), 0);
  assert.equal(turret.alive, false, 'turret marked dead after 60s');
});

test('effect: free_forge sets run.freeForge = true', () => {
  const h = boot();
  assert.equal(h.state.run.freeForge, undefined);

  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'free_forge', swarmDropIndex: 8 },
  });
  scoopDrop(h, drop);

  assert.equal(h.state.run.freeForge, true);
});

// -----------------------------------------------------------------------------
// 4. Drop lines / toasts
// -----------------------------------------------------------------------------

test('all eight drops emit their exact designated line in a toast', () => {
  for (const def of SWARM_DROP_DEFS) {
    const h = boot();
    const drop = h.helpers.spawnEntity({
      type: 'pickup',
      pos: { x: 0, z: 0 },
      data: { kind: SWARM_DROP_KIND, dropId: def.id, swarmDropIndex: 10 },
    });
    scoopDrop(h, drop);

    const toast = h.emitted.find((e) => e.event === 'toast' && e.payload.text === def.line);
    assert.ok(toast, `toast emitted for ${def.id} with line: "${def.line}"`);
    assert.equal(toast.payload.kind, 'good');
    assert.ok(toast.payload.ttl <= 2.5, 'toast ttl <= 2.5s');
  }
});

// -----------------------------------------------------------------------------
// 5. Brood kills, ambient exclusion, and idempotency
// -----------------------------------------------------------------------------

test('brood kills event advances drop counter', () => {
  const h = boot();
  h.state.mode = 'flight';
  h.state.run.phase = 'active';
  h.state.run.wave = 1;

  assert.equal(swarmDrops.killsSinceDrop(), 0);

  // Emit 12 brood kills at pos (10, 20)
  h.bus.emit('swarm:broodKills', { wave: 1, count: 12, pos: { x: 10, z: 20 } });
  assert.equal(getLiveDrops(h).length, 1);
  assert.equal(swarmDrops.killsSinceDrop(), 0);
});

test('ambient traffic without survival cohort produces no drops', () => {
  const h = boot();
  for (let i = 0; i < 30; i++) {
    killCohortBody(h, { cohort: null });
  }
  assert.equal(getLiveDrops(h).length, 0);
  assert.equal(swarmDrops.killsSinceDrop(), 0);
});

test('magnet ignores swarm drops and repair cells, pulling only normal loot', () => {
  const h = boot();
  h.player.pos = { x: 0, z: 0 };

  const repairCell = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 200, z: 0 },
    data: { kind: 'swarm_repair', swarmRepair: true },
  });
  const swarmDropItem = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 200 },
    data: { kind: SWARM_DROP_KIND, swarmDrop: true },
  });
  const normalScrap = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 150, z: 150 },
    data: { kind: 'ore_chunk' },
  });

  const magnetDrop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'magnet', swarmDropIndex: 20 },
  });
  scoopDrop(h, magnetDrop);

  assert.equal(repairCell.data.magnetPull, undefined, 'repair cell unaffected');
  assert.equal(swarmDropItem.data.magnetPull, undefined, 'swarm drop unaffected');
  assert.equal(normalScrap.data.magnetPull, true, 'scrap pulled');
});

test('dead weight does not damage target if colliding body was not thrown by player', () => {
  const h = boot();
  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'dead_weight', swarmDropIndex: 21 },
  });
  scoopDrop(h, drop);

  const unthrownRock = h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    mass: 20,
  });
  const enemy = h.helpers.spawnEntity({
    type: 'ship',
    pos: { x: 10, z: 0 },
    hull: 100,
    hullMax: 100,
  });

  h.bus.emit('combat:collisionConsequence', { targetId: enemy.id, otherId: unthrownRock.id });
  assert.equal(enemy.hull, 100, 'untouched because rock was not thrown');
  assert.equal(enemy.alive, true);
});

test('dead weight thrown rock does not damage player', () => {
  const h = boot();
  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'dead_weight', swarmDropIndex: 22 },
  });
  scoopDrop(h, drop);

  const rock = h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 0, z: 0 },
    mass: 20,
  });
  h.bus.emit('massline:throw', { payloadId: rock.id });

  const initialHull = h.player.hull;
  h.bus.emit('combat:collisionConsequence', { targetId: h.player.id, otherId: rock.id });
  assert.equal(h.player.hull, initialHull, 'player hull unaffected by thrown body');
});

test('a collected drop cannot be collected again', () => {
  const h = boot();
  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'free_forge', swarmDropIndex: 23 },
  });

  assert.equal(swarmDrops.liveDropCount(), 1);
  scoopDrop(h, drop);
  assert.equal(swarmDrops.liveDropCount(), 0);

  // Duplicate scoop
  scoopDrop(h, drop);
  assert.equal(swarmDrops.liveDropCount(), 0);
});

test('run:ended cleans up active timed effects', () => {
  const h = boot();
  const drop = h.helpers.spawnEntity({
    type: 'pickup',
    pos: { x: 0, z: 0 },
    data: { kind: SWARM_DROP_KIND, dropId: 'heavy_hands', swarmDropIndex: 24 },
  });
  scoopDrop(h, drop);
  assert.equal(swarmDrops.isHeavyHandsActive(), true);

  h.bus.emit('run:ended', {});
  assert.equal(swarmDrops.isHeavyHandsActive(), false);
  assert.equal(swarmDrops.killsSinceDrop(), 0);
});


test('Heavy Hands doubles the real knockback and restores it exactly (lead fix 2026-11-11)', async () => {
  const { WEAPONS } = await import('../src/data/weapons.js');
  const { swarmDrops } = await import('../src/systems/swarmDrops.js');
  const def = WEAPONS.find((w) => Number.isFinite(w.impulsePerHit) && w.impulsePerHit !== 600);
  const inherited = { id: def.id };                       // uses the def's value
  const own = { id: def.id, impulsePerHit: 77 };          // has its own override
  const player = { id: 1, data: { weapons: [inherited, own] } };
  const sys = Object.create(swarmDrops);
  sys.state = { simTime: 0 };
  sys._player = () => player;
  sys._applyHeavyHands(player);
  assert.equal(inherited.impulsePerHit, def.impulsePerHit * 2);
  assert.equal(own.impulsePerHit, 154);
  sys._resetTimedEffects();
  assert.equal(Object.prototype.hasOwnProperty.call(inherited, 'impulsePerHit'), false, 'inherited gun goes back to its def');
  assert.equal(own.impulsePerHit, 77);
});
