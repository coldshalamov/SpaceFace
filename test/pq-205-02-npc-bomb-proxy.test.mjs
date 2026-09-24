import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { applyNpcBombMirror, NPC_BOMB_PAYLOAD_ID } from '../src/ai/npcBombMirror.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { ENEMY_DOCTRINE_OVERRIDES } from '../src/data/combatDefs.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { shouldSyncPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import {
  adaptBombProjectileProxy, BOMB_PROXY_RADIUS, BOMB_TYPE, BOMB_VISUAL_RADIUS,
} from '../src/systems/bombs.js';
import { bombScenario } from './helpers/bombScenario.mjs';

// PQ-205.02 — one telegraphed pursuit-lane doctrine calls bombs.drop / commandDetonate,
// and a moving projectile-sweep proxy retires the capsule exactly once (inert destruction).

function perception() {
  return {
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0,
      combatDoctrineId: CombatDoctrineId.MINE_LAYER_WAKE,
      activity: {
        kind: ActivityKind.ATTACK_RUN, reason: 'pq-205.02',
        anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 180, startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: [{
      id: 1, kind: ContactKind.SHIP, alive: true, valid: true, visible: true,
      ageTicks: 0, hostile: true, confidence: 1, threat: 0.8,
      pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 },
      mobilityBand: 'high', cargoBand: 'valuable', tethered: false,
      operationalMassBand: 'light', tetherabilityBand: 'good', tags: [],
    }],
    events: [],
  };
}

function directive() {
  return Object.freeze({
    tick: 0, squadId: 'fixture', memberId: 2, role: 'area_denial', tactic: 'seed_the_exit',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.ENGAGE, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

function sweepHost(state, bus) {
  const host = Object.create(physics);
  host.init({ state, bus });
  return host;
}

// Counterplay fire comes from a ship that is NOT the bomb's owner (the owner's own rounds pass
// through the proxy — see the pass-through test below).
const FOREIGN_SHOOTER_ID = 424242;

function fireThrough(t, bomb, { ownerId = FOREIGN_SHOOTER_ID } = {}) {
  const x = bomb.pos.x;
  const z = bomb.pos.z;
  const proj = t.helpers.spawnEntity({
    type: 'projectile',
    pos: { x: x + 16, z },
    vel: { x: -960, z: 0 },
    rot: Math.PI,
    radius: 1,
    collides: true,
    collisionMask: Masks.SHIP,
    ownerId,
    data: { damage: 12, damageType: 'kinetic', weaponId: 'wpn_pq205_fixture' },
  });
  proj.prevPos.x = x - 16;
  proj.prevPos.z = z;
  const host = sweepHost(t.state, t.bus);
  host.sweepProjectiles(1 / 60, t.state);
  return { proj, host };
}

test('the wake telegraph still precedes the drop line', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  const run = (tick) => runtime.update({
    tick, entityId: 2, doctrineId: CombatDoctrineId.MINE_LAYER_WAKE,
    perception: perception(), directive: directive(),
  });
  const cue = run(1);
  assert.equal(cue.phase, 'wake_cue');
  assert.equal(cue.telegraph.kind, 'wake_mines');
  assert.equal(cue.allowedActionId, null);
  const drop = run(31);
  assert.equal(drop.phase, 'mine_drop');
  assert.equal(drop.allowedActionId, 'action_drop_bomb');
  assert.equal(ENEMY_DOCTRINE_OVERRIDES.mine_layer_jackal, 'mine_layer_wake');
});

test('the NPC mirror drops one frag through bombs.drop, then commands after arming', () => {
  const t = bombScenario();
  try {
    const npc = t.spawn({ pos: { x: 80, z: 0 }, vel: { x: 40, z: 0 }, rot: 0 });
    const idle = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'wake_cue', bombs: t.system,
    });
    assert.equal(idle, null, 'the telegraph never releases a bomb');
    const dropped = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'mine_drop', bombs: t.system,
    });
    assert.equal(dropped.verb, 'drop');
    assert.equal(dropped.payloadId, NPC_BOMB_PAYLOAD_ID);
    assert.equal(t.events('dropped').length, 1);
    assert.equal(t.events('dropped')[0].ownerId, npc.id);
    const bomb = t.state.entities.get(dropped.bombId);
    assert.equal(bomb.data.ownerId, npc.id);
    const again = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'mine_drop', bombs: t.system,
    });
    assert.equal(again, null, 'safe fuze cannot be commanded; no second drop');
    assert.equal(t.events('dropped').length, 1);
    t.tick(31);
    const commanded = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'mine_drop', bombs: t.system,
    });
    assert.equal(commanded.verb, 'command');
    assert.equal(commanded.count, 1);
    assert.equal(bomb.data.phase, 'warning');
    assert.equal(bomb.data.trigger, 'command');
    const third = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'mine_drop', bombs: t.system,
    });
    assert.equal(third, null, 'command is idempotent once the fuze is committed');
  } finally { t.close(); }
});

test('the pose adapter publishes a moving projectile-sweep disc without a Rapier body', () => {
  const t = bombScenario({ velocity: { x: 80, z: 0 } });
  try {
    const bomb = t.drop();
    assert.equal(bomb.type, BOMB_TYPE);
    assert.equal(bomb.physicsBody, false);
    assert.equal(shouldSyncPhysicsBodyEntity(bomb), false);
    assert.equal(bomb.collides, true);
    assert.equal(bomb.collisionMask, Masks.PROJECTILE);
    assert.equal(bomb.radius, BOMB_PROXY_RADIUS);
    assert.equal(bomb.data.visualRadius, BOMB_VISUAL_RADIUS);
    const before = adaptBombProjectileProxy(bomb);
    t.tick(8);
    const after = adaptBombProjectileProxy(bomb);
    assert.ok(after.x > before.x, 'the adapter follows the kinematic pose');
    assert.equal(after.collides, true);
    assert.equal(bomb.physicsBody, false);
  } finally { t.close(); }
});

test('a projectile sweep retires the bomb exactly once and never detonates it', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop();
    const { proj } = fireThrough(t, bomb);
    assert.equal(proj.alive, false, 'the round is consumed');
    assert.equal(bomb.alive, false);
    assert.equal(bomb.data.phase, 'spent');
    assert.equal(bomb.data.retired, true);
    assert.equal(t.events('destroyed').length, 1);
    assert.equal(t.events('destroyed')[0].reason, 'projectile');
    assert.equal(t.events('destroyed')[0].shotBy, FOREIGN_SHOOTER_ID, 'the shooter is named for credit');
    assert.equal(t.events('destroyed')[0].ownerId, t.player.id, 'ownerId stays the dropper');
    assert.equal(t.events('detonated').length, 0, 'inert destruction — the payload does not cook');
    assert.equal(t.system.retire(bomb, 'projectile'), false, 'exactly once');
    t.bus.emit('projectile:hit', { targetId: bomb.id, ownerId: t.player.id, pos: bomb.pos });
    assert.equal(t.events('destroyed').length, 1);
  } finally { t.close(); }
});

test('the owner’s own fire passes through the proxy; two same-tick rounds retire once', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop();
    // The dropper's own rounds must NOT destroy their own ordnance (regression: the sweep skip
    // used to compare the projectile owner only with the TARGET id, so owner fire popped the
    // owner's bomb).
    const own = fireThrough(t, bomb, { ownerId: t.player.id });
    assert.equal(bomb.alive, true, 'owner fire passes through the capsule');
    assert.equal(t.events('destroyed').length, 0);
    assert.equal(own.proj.alive, true, 'the owner round is not consumed by its own bomb');

    // Two foreign rounds sweeping the disc in ONE physics step retire exactly once.
    const x = bomb.pos.x, z = bomb.pos.z;
    const makeRound = (dx) => {
      const p = t.helpers.spawnEntity({
        type: 'projectile',
        pos: { x: x + dx, z },
        vel: { x: -960, z: 0 },
        rot: Math.PI,
        radius: 1,
        collides: true,
        collisionMask: Masks.PROJECTILE,
        ownerId: FOREIGN_SHOOTER_ID,
        data: { damage: 12, damageType: 'kinetic', weaponId: 'wpn_pq205_fixture' },
      });
      p.prevPos.x = x - 16;
      p.prevPos.z = z;
      return p;
    };
    makeRound(16);
    makeRound(8);
    const host = sweepHost(t.state, t.bus);
    host.sweepProjectiles(1 / 60, t.state);
    assert.equal(bomb.alive, false);
    assert.equal(t.events('destroyed').length, 1, 'one sweep, one retire, no double pop');
    assert.equal(t.events('destroyed')[0].shotBy, FOREIGN_SHOOTER_ID);
  } finally { t.close(); }
});

test('unarmed, armed, and warning shots are all inert; arming law still blocks remote command', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop();
    assert.equal(t.system.commandDetonate(t.player.id), 0, 'safe fuze cannot be bypassed');
    fireThrough(t, bomb);
    assert.equal(bomb.alive, false);
    assert.equal(t.events('detonated').length, 0);
    t.tick(80);
    const armed = t.drop();
    assert.ok(armed, 'payload recharge lets a second cassette leave the bay');
    t.tick(31);
    assert.equal(armed.data.armed, true);
    fireThrough(t, armed);
    assert.equal(armed.alive, false);
    assert.equal(t.events('detonated').length, 0);
    t.tick(80);
    const warned = t.drop();
    t.tick(31);
    assert.equal(t.system.commandDetonate(t.player.id), 1);
    assert.equal(warned.data.phase, 'warning');
    fireThrough(t, warned);
    assert.equal(warned.alive, false);
    assert.equal(t.events('detonated').length, 0, 'a committed warning is still defused by the shot');
  } finally { t.close(); }
});

test('same-tick races retire or detonate exactly once', () => {
  const t = bombScenario();
  try {
    const shot = t.drop('bomb_frag');
    t.tick(31);
    t.system.commandDetonate(t.player.id);
    fireThrough(t, shot);
    assert.equal(shot.data.retired, true);
    assert.equal(t.events('destroyed').length, 1);
    assert.equal(t.events('detonated').length, 0, 'bullet after command still defuses this tick');

    const primed = t.drop('bomb_concussion');
    t.tick(31);
    t.system.commandDetonate(t.player.id);
    t.system.retire(primed, 'projectile');
    assert.equal(t.system.commandDetonate(t.player.id), 0);
    t.tick(11);
    assert.equal(t.events('detonated').length, 0, 'retired warning never resolves into a blast');

    const expiry = t.drop('bomb_emp');
    t.tick(31);
    t.system.commandDetonate(t.player.id);
    t.tick(11);
    assert.equal(t.events('detonated').length, 1, 'unopposed warning still bursts');
    assert.equal(expiry.alive, false);
    assert.equal(t.system.retire(expiry, 'projectile'), false, 'spent bomb cannot be retired again');
  } finally { t.close(); }
});

test('owner death leaves the capsule shootable; the dead owner cannot command it', () => {
  const t = bombScenario();
  try {
    const npc = t.spawn({ pos: { x: 40, z: 0 }, vel: { x: 20, z: 0 } });
    const dropped = applyNpcBombMirror({
      state: t.state, entity: npc, doctrinePhase: 'mine_drop', bombs: t.system,
    });
    const bomb = t.state.entities.get(dropped.bombId);
    npc.alive = false;
    t.tick(31);
    assert.equal(t.system.commandDetonate(npc.id), 0);
    assert.equal(bomb.alive, true, 'the trap outlives its dropper');
    fireThrough(t, bomb);
    assert.equal(bomb.alive, false);
    assert.equal(t.events('destroyed').length, 1);
    assert.equal(t.events('detonated').length, 0);
  } finally { t.close(); }
});
