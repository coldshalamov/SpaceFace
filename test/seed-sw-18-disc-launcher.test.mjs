// SEED-SW-18 — Disc Launcher: ricochet sawblades that bounce BETWEEN ENEMIES, not off
// rocks. A hull contact lands its real hit, spends one authored bounce, and the same
// body flies on — at least two hull contacts before the edge is spent.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { createLineage, resetLineageIds } from '../src/combat/attackLineage.js';
import { weapons } from '../src/systems/weapons.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_disc_launcher_m');

function ship(id, x, z, team) {
  return { id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 8, team, data: {} };
}

function fixture() {
  const state0 = {
    tick: 5, simTime: 0, playerId: 'player', entities: new Map(), entityList: [],
    entityIndex: null, spatialHash: null,
  };
  const owner0 = ship('player', 0, 0, 'player');
  // The fitted spec — def-declared traits (bank_shot x3 + smart_bank) compiled through the
  // same cache the fire path uses, so the lineage carries the ricochet action and the cone.
  const spec = weapons._attackSpecFor.call(
    { state: state0, helpers: {}, bus: { emit: () => {} } },
    { defId: DEF.id, slotIndex: 0 }, DEF, state0, owner0);
  const owner = owner0;
  const h1 = ship('h1', 40, 0, 'brood');
  const h2 = ship('h2', -60, 0, 'brood');
  const h3 = ship('h3', 60, 0, 'brood');
  const entities = new Map([owner, h1, h2, h3].map((e) => [e.id, e]));
  const state = {
    tick: 5, simTime: 0, playerId: 'player', entities,
    entityList: [...entities.values()],
    entityIndex: null, spatialHash: null, combat: { entities: {} },
  };
  const host = {
    state,
    helpers: { getEntity: (id) => entities.get(id) || null, spawnEntity: () => null, routeCombatDamage: () => true },
    bus: { emit: () => {} },
    _attackLive: new Map(),
    _attackQueryScratch: [],
  };
  resetLineageIds(SEED);
  const runtime = createLineage({ spec, createdTick: 5, sourceEntityId: 'player' });
  const projectile = {
    id: 'disc1', type: 'projectile', alive: true,
    pos: { x: 36, z: 0 }, vel: { x: 300, z: 0 }, radius: 2, rot: 0,
    ownerId: 'player', team: 'player',
    data: { hullRicochet: true, weaponId: DEF.id, maxDistance: 420, damagePacket: { channels: { kinetic: 14 }, statuses: [] } },
  };
  state.entities.set(projectile.id, projectile);
  state.entityList.push(projectile);
  host._attackLive.set(projectile.id, { spec, runtime });
  return { state, host, projectile, runtime, spec };
}

function hit(host, projectile, targetId, x) {
  weapons._onAttackHit.call(host, {
    targetId, projectileId: projectile.id, ownerId: 'player',
    pos: { x, z: 0 }, normal: { x: -Math.sign(projectile.vel.x), z: 0 },
    approach: { x: Math.sign(projectile.vel.x), z: 0 },
    projectileVelocity: { x: projectile.vel.x, z: projectile.vel.z },
    damagePacket: { channels: { kinetic: 14 }, statuses: [], hit: {} },
  });
}

test('disc launcher is catalogued and offered by the armory', () => {
  assert.ok(DEF);
  const offer = SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id);
  assert.equal(offer && offer.id, 'disc_launcher');
});

test('the disc ricochets off hostile bodies — at least two real contacts before dying', () => {
  const { host, projectile, runtime, spec } = fixture();
  assert.ok(spec.trajectory.bounces >= 2, 'authored bounce budget');

  // Contact 1 at h1 (+x flight): the hit lands AND the body flies on (consumed? no).
  hit(host, projectile, 'h1', 38);
  assert.equal(runtime.remaining.bounces, spec.trajectory.bounces - 1, 'one bounce spent');
  assert.ok(host._attackLive.has(projectile.id), 'disc still live after first hull');
  assert.ok(projectile.vel.x < 0, `reflected flight, got vx=${projectile.vel.x}`);

  // Contact 2 at h2 (-x flight): second hull spends the second bounce.
  hit(host, projectile, 'h2', -58);
  assert.equal(runtime.remaining.bounces, spec.trajectory.bounces - 2, 'second bounce spent');
  assert.ok(host._attackLive.has(projectile.id), 'disc still live after second hull');
  assert.ok(projectile.vel.x > 0, 'reflected again');
});
