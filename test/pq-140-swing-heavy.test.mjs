// PQ-140.01 — rope-swing around a heavy ship.
//
// The throw-into-a-heavy half is already on the route. This half measures the latch itself,
// fixed seed, on the live Rapier owner and the standard tether. No new force: both drives
// are idle, so the only exchange is the rope's equal-and-opposite impulse. The heavier
// living hull is the pivot because it is heavier, not because the 1800 scenery floor was
// lowered. Asteroids and stations still need that floor to score as a massive anchor.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { HEAVY_AS_TERRAIN_MASS } from '../src/combat/impulseKernel.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import {
  classifyMasslineIntent,
  MASSIVE_ANCHOR_MIN_MASS,
} from '../src/combat/masslineTargetScoring.js';
import { createBus } from '../src/core/eventBus.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const SEED = 4242;
const LINE = 140;
const TANGENT_SPEED = 70;
const SWING_TICKS = 180;

function shipBody(id, defId, x, z, vx, vz) {
  const spec = makeShipEntitySpec(defId, {
    team: 2,
    pos: { x, z },
    ai: { archetype: 'fleeing_trader', passive: true },
  });
  return {
    ...spec,
    id,
    alive: true,
    isPlayer: id === 'player',
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: spec.radius,
      mass: spec.mass,
      inertiaY: spec.mass * 4,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    data: { ...spec.data },
  };
}

function planarSpeed(entity) {
  return Math.hypot(entity.vel.x, entity.vel.z);
}

function idle(entity) {
  writePhysicsControl(entity, {
    source: 'pq140-swing',
    mode: 'newtonian',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    maxSpeed: Infinity,
  });
}

function bearing(from, to) {
  return Math.atan2(to.pos.z - from.pos.z, to.pos.x - from.pos.x);
}

function wrapDelta(next, prev) {
  let delta = next - prev;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

async function swingAround(playerDefId, otherDefId) {
  const player = shipBody('player', playerDefId, LINE, 0, 0, TANGENT_SPEED);
  const other = shipBody('other', otherDefId, 0, 0, 0, 0);
  assert.equal(player.type, 'ship');
  assert.equal(other.type, 'ship');
  assert.equal(other.alive, true);
  assert.equal(isAttachable(other, player.id), true, `${otherDefId} must be a legal latch`);

  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    meta: { seed: SEED },
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player], [other.id, other]]),
    entityList: [player, other],
    player: { tether: null },
  };
  ensureCombatState(state);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([player, other]);
    const attachments = createAttachmentService({
      state,
      catalog: createCombatCatalog(),
      helpers: { combatPhysics: runtime },
      bus: createBus(),
    });
    const created = attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: other.id,
      sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
      targetWorld: { x: other.pos.x, y: 0, z: other.pos.z },
    });
    assert.equal(created.ok, true, created.reason || 'latch failed');

    const before = {
      player: planarSpeed(player),
      other: planarSpeed(other),
      playerVel: { x: player.vel.x, z: player.vel.z },
    };
    let swept = 0;
    let aim = bearing(other, player);
    for (let tick = 0; tick < SWING_TICKS; tick += 1) {
      idle(player);
      idle(other);
      runtime.step(DT);
      state.tick += 1;
      state.simTime += DT;
      const nextAim = bearing(other, player);
      swept += wrapDelta(nextAim, aim);
      aim = nextAim;
    }
    return {
      player,
      other,
      before,
      after: {
        player: planarSpeed(player),
        other: planarSpeed(other),
        playerVel: { x: player.vel.x, z: player.vel.z },
      },
      swept,
      attachment: created.attachment,
    };
  } finally {
    runtime.dispose();
  }
}

test('a living heavy ship is the pivot and a light ship is still the one thrown', async () => {
  const heavy = await swingAround('ship_kestrel', 'ship_warden');
  assert.ok(heavy.other.mass >= HEAVY_AS_TERRAIN_MASS, `warden mass ${heavy.other.mass}`);
  assert.ok(heavy.other.mass > heavy.player.mass,
    `the heavy (${heavy.other.mass}) must outweigh the player (${heavy.player.mass})`);
  assert.equal(heavy.attachment.state, 'active', 'the swing line stays a rope');
  assert.equal(heavy.other.alive, true);
  assert.ok(Math.abs(heavy.swept) > 1,
    `the player must travel an arc around the heavy, swept ${heavy.swept.toFixed(3)} rad`);

  const playerDv = Math.hypot(
    heavy.after.playerVel.x - heavy.before.playerVel.x,
    heavy.after.playerVel.z - heavy.before.playerVel.z,
  );
  assert.ok(playerDv > 40,
    `player speed along the arc must change, |dv| ${playerDv.toFixed(2)} `
    + `(${heavy.before.player.toFixed(2)} -> ${heavy.after.player.toFixed(2)})`);
  assert.ok(heavy.after.other < playerDv * 0.25,
    `heavy pivot speed must change much less: ${heavy.before.other.toFixed(2)} -> ${heavy.after.other.toFixed(2)} `
    + `against player |dv| ${playerDv.toFixed(2)}`);
  assert.ok(heavy.after.other < heavy.after.player * 0.25,
    `heavy speed ${heavy.after.other.toFixed(2)} must stay well under the swinging player ${heavy.after.player.toFixed(2)}`);

  // The starter outweighs nothing on the roster. The throw fixture is a Bastion so the
  // Wasp is actually the light body; the pivot fixture above stays the light starter.
  const light = await swingAround('ship_bastion', 'ship_wasp');
  assert.ok(light.other.mass < light.player.mass * 0.5,
    `wasp mass ${light.other.mass} must sit well under the player ${light.player.mass}`);
  assert.equal(light.attachment.state, 'active');
  assert.equal(light.other.alive, true);
  const playerDrop = Math.abs(light.after.player - light.before.player);
  const lightGain = light.after.other - light.before.other;
  assert.ok(playerDrop < 15,
    `player speed must stay when the light is thrown: ${light.before.player.toFixed(2)} -> ${light.after.player.toFixed(2)}`);
  assert.ok(lightGain > 50,
    `light speed must change: ${light.before.other.toFixed(2)} -> ${light.after.other.toFixed(2)}`);
  assert.ok(lightGain > playerDrop * 4,
    `the light is the body that moves (${lightGain.toFixed(2)}) not the player (${playerDrop.toFixed(2)})`);
  const keep = light.after.player > 1
    ? light.after.playerVel.z / light.after.player
    : 0;
  assert.ok(keep > 0.85,
    `player heading of motion must stay, alignment ${keep.toFixed(3)}`);
});

test('asteroids and stations still need the 1800 massive-anchor floor', () => {
  assert.equal(MASSIVE_ANCHOR_MIN_MASS, 1800);
  assert.equal(HEAVY_AS_TERRAIN_MASS, 150);

  const player = {
    id: 'player',
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  };
  const opts = { turnIntent: 1, intentDir: { x: 1, z: 0 } };
  const intent = (body) => classifyMasslineIntent(player, [body], opts).id;
  const body = (id, type, mass) => ({
    id,
    type,
    pos: { x: 160, z: 0 },
    vel: { x: 0, z: 0 },
    mass,
  });

  assert.equal(intent(body('rock-floor', 'asteroid', 1800)), 'massive-anchor-sling');
  assert.equal(intent(body('rock-under', 'asteroid', 1799)), 'precision-pick');
  assert.equal(intent(body('station-floor', 'station', 1800)), 'massive-anchor-sling');
  assert.equal(intent(body('station-under', 'station', 150)), 'precision-pick');
  assert.equal(intent(body('leviathan', 'ship', 600)), 'precision-pick',
    'a heavy hull is a pivot by mass, not by the scenery anchor floor');
});
