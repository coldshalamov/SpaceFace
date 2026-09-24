// §22 F17 — repair is staying attached. Hull climbs only while a taut line holds a
// disabled friendly. Cutting the line freezes the partial hull and leaves the drive dead.
// Holding through to full hull is what lets the ship thrust again.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LATCH_REPAIR_HULL_PER_SECOND,
  stepLatchRepair,
} from '../src/combat/latchRepair.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

function driveBook(disabled) {
  return {
    capabilities: { drive: !disabled },
    multipliers: { movement: disabled ? 0 : 1 },
    blockedActionTags: disabled ? ['dash', 'sling'] : [],
    subsystems: {
      subsystem_drive: {
        effectiveDisabled: disabled,
        destroyed: disabled,
        health: disabled ? 0 : 45,
        maxHealth: 45,
      },
    },
  };
}

function world({
  friendHull = 40,
  friendTeam = 2,
  friendType = 'ship',
  passive = true,
  hostile = false,
  ownerRole = null,
  ownerId = 'player',
  phase = 'loaded',
  attachmentState = 'active',
  restLength = 40,
  span = 40,
  tetherActive = true,
} = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { x: 0, z: 0 }, hull: 140, hullMax: 140, data: {},
  };
  const owner = ownerId === 'player' ? player : {
    id: ownerId, type: 'ship', alive: true, team: 2,
    pos: { x: 0, z: 0 }, hull: 80, hullMax: 80,
    data: { trafficRole: ownerRole, ai: { passive: true } },
  };
  const friend = {
    id: 'friend', type: friendType, alive: true, team: friendTeam,
    pos: { x: span, z: 0 }, hull: friendHull, hullMax: 100,
    data: { ai: { passive, hostile }, defId: 'ship_mule' },
  };
  const entities = new Map([[player.id, player], [friend.id, friend]]);
  if (owner !== player) entities.set(owner.id, owner);
  const attachment = {
    id: 'line',
    state: attachmentState,
    ownerId: owner.id,
    targetId: friend.id,
    restLength,
    phase: owner === player ? null : phase,
  };
  return {
    mode: 'flight',
    playerId: player.id,
    entities,
    player: {
      tether: {
        active: tetherActive && owner === player,
        targetId: friend.id,
        attachmentId: 'line',
        phase: owner === player ? phase : 'slack',
        restLength,
      },
    },
    combat: {
      attachments: { byId: { line: attachment } },
      entities: { friend: driveBook(true) },
    },
  };
}

function hull(state) {
  return state.entities.get('friend').hull;
}

function driveOn(state) {
  const runtime = state.combat.entities.friend;
  return runtime.capabilities.drive === true
    && runtime.subsystems.subsystem_drive.effectiveDisabled === false;
}

test('a taut latch raises hull and a cut line freezes it still disabled', () => {
  const state = world();
  const before = hull(state);
  const gained = stepLatchRepair(state, 2);
  assert.equal(gained, LATCH_REPAIR_HULL_PER_SECOND * 2);
  assert.equal(hull(state), before + LATCH_REPAIR_HULL_PER_SECOND * 2);
  assert.equal(driveOn(state), false, 'a partial repair does not free the drive');
  const frozen = hull(state);
  state.combat.attachments.byId.line.state = 'broken';
  state.player.tether.active = false;
  state.player.tether.phase = 'slack';
  assert.equal(stepLatchRepair(state, 2), 0);
  assert.equal(hull(state), frozen, 'hull stays where the line let go');
  assert.equal(driveOn(state), false, 'the ship is still disabled');
});

test('holding the taut line to full hull lets the ship thrust again', () => {
  const state = world();
  const need = 100 - hull(state);
  stepLatchRepair(state, need / LATCH_REPAIR_HULL_PER_SECOND);
  assert.equal(hull(state), 100);
  assert.equal(driveOn(state), true);
  assert.equal(state.combat.entities.friend.multipliers.movement, 1);
});

test('a slack line, an enemy, and a rock do not heal', () => {
  const slack = world({ phase: 'slack', restLength: 200, span: 40 });
  assert.equal(stepLatchRepair(slack, 2), 0);
  assert.equal(hull(slack), 40);

  const enemy = world({ friendTeam: 1, hostile: true, passive: false });
  assert.equal(stepLatchRepair(enemy, 2), 0);
  assert.equal(hull(enemy), 40);

  const rock = world({ friendType: 'asteroid' });
  assert.equal(stepLatchRepair(rock, 2), 0);
  assert.equal(rock.entities.get('friend').hull, 40);
});

test('a live tender taut on the hull repairs it the same way', () => {
  const state = world({
    ownerId: 'tender',
    ownerRole: 'tender',
    phase: 'slack',
    tetherActive: false,
    restLength: 40,
    span: 40,
  });
  const gained = stepLatchRepair(state, 1);
  assert.equal(gained, LATCH_REPAIR_HULL_PER_SECOND);
  assert.equal(hull(state), 40 + LATCH_REPAIR_HULL_PER_SECOND);
});

test('the tether tick is what applies the repair', () => {
  const state = world();
  const system = Object.create(tetherGameplay);
  system._updateTetherGameplay = () => {};
  const before = hull(state);
  system.update(1, state);
  assert.equal(hull(state), before + LATCH_REPAIR_HULL_PER_SECOND);
});
