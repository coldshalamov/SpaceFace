// PQ-026.02 — Inertial shunt ram plate.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fillInertialShuntImpulses,
  hullCarriesInertialShunt,
  tryApplyInertialShuntFromImpact,
} from '../src/combat/inertialShunt.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import {
  INERTIAL_SHUNT_TUNING,
  INERTIAL_SHUNT_WEAPON_ID,
} from '../src/data/combatDefs.js';
import { TECH_NODES } from '../src/data/tech.js';
import { WEAPONS } from '../src/data/weapons.js';

const SCREEN = INERTIAL_SHUNT_TUNING.screenDepthWu;
const CRUISE = 105;

function hull(id, mass, velX, fittings = []) {
  return {
    id,
    type: 'ship',
    alive: true,
    mass,
    pos: { x: 0, z: 0 },
    vel: { x: velX, z: 0 },
    physicsBody: { schemaVersion: 1, mass, radius: 12, inertiaY: mass, dynamic: true, revision: 0 },
    data: { fittings, weapons: fittings.map((defId, slotIndex) => ({ defId, slotIndex })) },
  };
}

test('Inertial Shunt is a small-slot ram plate next to the marker and sink', () => {
  const weapon = WEAPONS.find((entry) => entry.id === INERTIAL_SHUNT_WEAPON_ID);
  const graviton = TECH_NODES.find((entry) => entry.id === 'tech_graviton_drives');
  assert.ok(weapon);
  assert.equal(weapon.size, 'S');
  assert.equal(weapon.requiresTech, 'tech_graviton_drives');
  assert.ok(weapon.dmg > 0 && weapon.dmg < 10);
  assert.ok(weapon.impulsePerHit <= 1);
  assert.ok(graviton.unlocks.modules.includes(INERTIAL_SHUNT_WEAPON_ID));
});

test('a shunt ram on a light hostile sends it a screen and stops the ramming hull', () => {
  const playerImp = { x: 0, y: 0, z: 0 };
  const targetImp = { x: 0, y: 0, z: 0 };
  const player = hull(1, 24, CRUISE, [INERTIAL_SHUNT_WEAPON_ID]);
  const wasp = hull(2, 16, 0);
  assert.equal(hullCarriesInertialShunt(player), true);
  assert.equal(fillInertialShuntImpulses(playerImp, targetImp, player, wasp), true);
  const waspDeltaV = Math.hypot(targetImp.x, targetImp.z) / 16;
  const playerDeltaV = Math.hypot(playerImp.x, playerImp.z) / 24;
  const playerRemain = CRUISE - playerDeltaV;
  assert.ok(waspDeltaV >= SCREEN, `light hostile must fly ≥ 1 screen, got ${waspDeltaV.toFixed(1)} WU/s`);
  assert.ok(playerRemain <= INERTIAL_SHUNT_TUNING.playerStopWu,
    `ramming hull must dump to ≤ ${INERTIAL_SHUNT_TUNING.playerStopWu} WU/s, remain ${playerRemain.toFixed(1)}`);
});

test('a shunt ram on a heavy hull shrugs — the ramming ship keeps most of its speed', () => {
  const playerImp = { x: 0, y: 0, z: 0 };
  const targetImp = { x: 0, y: 0, z: 0 };
  const player = hull(1, 24, CRUISE, [INERTIAL_SHUNT_WEAPON_ID]);
  const warden = hull(2, 150, 0);
  assert.equal(fillInertialShuntImpulses(playerImp, targetImp, player, warden), true);
  const heavyDeltaV = Math.hypot(targetImp.x, targetImp.z) / 150;
  const playerDeltaV = Math.hypot(playerImp.x, playerImp.z) / 24;
  assert.ok(heavyDeltaV < 20, `heavy shrugs, got ${heavyDeltaV.toFixed(1)} WU/s`);
  assert.ok(playerDeltaV < CRUISE * 0.4, `player keeps speed against a heavy, dumped ${playerDeltaV.toFixed(1)}`);
});

test('a fitted shunt on contact queues the swap and ignores a scrape', () => {
  const player = hull(1, 24, CRUISE, [INERTIAL_SHUNT_WEAPON_ID]);
  const wasp = hull(2, 16, 0);
  const scrape = hull(3, 16, CRUISE - 5);
  scrape.vel.x = 90;
  player.vel.x = 95;
  const state = {
    tick: 12,
    playerId: 1,
    entities: new Map([[1, player], [2, wasp], [3, scrape]]),
  };
  const getEntity = (id) => state.entities.get(id);
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  const cooldown = new Map();

  const bump = tryApplyInertialShuntFromImpact(
    state, { aId: 1, bId: 3, tick: 12 }, getEntity, a, b, cooldown,
  );
  assert.equal(bump, null, 'a scrape under the closing floor does not shunt');

  player.vel.x = CRUISE;
  wasp.vel.x = 0;
  const ram = tryApplyInertialShuntFromImpact(
    state, { aId: 1, bId: 2, tick: 12 }, getEntity, a, b, cooldown,
  );
  assert.ok(ram);
  assert.equal(ram.targetId, 2);
  assert.ok(ram.targetDeltaV >= SCREEN);

  const playerCmd = consumePhysicsCommand(player);
  const waspCmd = consumePhysicsCommand(wasp);
  assert.ok(playerCmd && playerCmd.impulses.length >= 1);
  assert.ok(waspCmd && waspCmd.impulses.length >= 1);
});
