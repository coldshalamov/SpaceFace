// U2 (WF-02): all four specialists obey physical/combat incapacitation (disabled, stunned,
// subsystem capability loss) instead of firing powers while stunned/EMP'd, a beaten cutter
// pass releases its in-progress commit lock so a paired ghost is not frozen by a whiff, and
// a late-window cut still reserves the authored breather.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySpecialistCounterplay,
  publishedWardTarget,
  refreshWardScreenPublication,
  wardScreenTarget,
} from '../src/ai/specialistCounterplay.js';

function makeHarness() {
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const rock = { id: 2, type: 'asteroid', alive: true, pos: { x: 100, z: 0 } };
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    playerId: player.id,
    entities,
    entityList: [player, rock],
    combat: { entities: {} },
  };
  let lineAlive = true;
  const line = { id: 'line-4242', state: 'active', ownerId: player.id, targetId: rock.id };
  const attachments = {
    listForEntity(id) {
      return id === player.id && lineAlive ? [line] : [];
    },
    breakAttachment(id, reason, actorId) {
      if (!lineAlive || id !== line.id) return { ok: false };
      lineAlive = false;
      line.state = 'broken';
      line.breakReason = reason;
      line.brokenBy = actorId;
      return { ok: true };
    },
  };
  return { state, player, rock, attachments, resetLine() { lineAlive = true; line.state = 'active'; } };
}

test('a disabled, stunned, or drive-disabled tether raider aborts its committed pass into recovery', () => {
  const h = makeHarness();
  const raider = {
    id: 10,
    type: 'ship',
    alive: true,
    hull: 80,
    pos: { x: 40, z: 0 },
    data: { enemyTypeId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);
  h.state.entityList.push(raider);

  // Commit at tick 20
  assert.equal(applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'spool_cue', tick: 20, attachments: h.attachments,
  }), null);
  assert.ok(raider.data._cutterCommit, 'cutter committed');

  // EMP / stun mid-pass aborts the pass into recovery and does not cut in attach_window
  raider.data.stunned = true;
  const cutWhileStunned = applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'attach_window', tick: 25, attachments: h.attachments,
  });
  assert.equal(cutWhileStunned, null);
  assert.equal(raider.data._cutterCommit, undefined, 'stunned cutter drops its commit');
  assert.ok(raider.data._cutterRecoverUntil > 25, 'aborted pass enters recovery');

  // Drive subsystem disabled blocks a fresh commit even after recovery expires
  raider.data.stunned = false;
  h.state.combat.entities[String(raider.id)] = { capabilities: { drive: false } };
  assert.equal(applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'spool_cue', tick: 200, attachments: h.attachments,
  }), null);
  assert.equal(raider.data._cutterCommit, undefined, 'drive-disabled cutter cannot commit');
});

test('a beaten cutter pass releases the commit lock; a late-window cut still reserves a breather', () => {
  const h = makeHarness();
  const raider = {
    id: 11, type: 'ship', alive: true, hull: 80,
    pos: { x: 40, z: 0 },
    data: { enemyTypeId: 'tether_control_raider' },
  };
  const ghost = {
    id: 12, type: 'ship', alive: true, hull: 80, shield: 0,
    pos: { x: 40, z: 0 },
    data: { enemyTypeId: 'quiet_ghost' },
  };
  h.state.entities.set(raider.id, raider);
  h.state.entities.set(ghost.id, ghost);
  h.state.entityList.push(raider, ghost);
  const fieldsPort = { disruptNear: () => 1 };

  // 1. Raider commits at tick 10, player beats the angle at tick 12 -> lock releases immediately
  applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'spool_cue', tick: 10, attachments: h.attachments,
  });
  assert.ok(raider.data._cutterCommit);
  h.player.pos.z = -200; // beat the sweep angle
  applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'attach_window', tick: 12, attachments: h.attachments,
  });
  assert.equal(raider.data._cutterCommit, undefined);

  // Ghost is no longer blocked by the whiffed cutter pass at tick 14
  applySpecialistCounterplay({
    state: h.state, specialist: ghost, enemyId: 'quiet_ghost',
    doctrinePhase: 'charge_cue', tick: 14, fields: fieldsPort,
  });
  assert.ok(ghost.data._disruptWork, 'ghost can acquire once the cutter whiffed');

  // If the working ghost is weapon-disabled mid-work, its work aborts and releases the lock
  h.state.combat.entities[String(ghost.id)] = { capabilities: { weapons: false } };
  assert.equal(applySpecialistCounterplay({
    state: h.state, specialist: ghost, enemyId: 'quiet_ghost',
    doctrinePhase: 'fire_window', tick: 50, fields: fieldsPort,
  }), null);
  assert.equal(ghost.data._disruptWork, undefined, 'weapon-disabled ghost loses its work interval');
  h.state.combat.entities[String(ghost.id)] = { capabilities: { weapons: true } };

  // 2. Late-window cut (commits at 200, lands at 242 near the 45-tick deadline) still holds ghost out for a full breather
  h.player.pos.z = 0;
  raider.data._cutterRecoverUntil = 0;
  applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'spool_cue', tick: 200, attachments: h.attachments,
  });
  const lateCut = applySpecialistCounterplay({
    state: h.state, specialist: raider, enemyId: 'tether_control_raider',
    doctrinePhase: 'attach_window', tick: 242, attachments: h.attachments,
  });
  assert.equal(lateCut && lateCut.verb, 'cut_line');

  // At tick 260 (past the original 245 commit deadline, but inside the 43-tick post-cut breather), ghost still defers
  ghost.data._pq140LastVerbTick = -Infinity;
  applySpecialistCounterplay({
    state: h.state, specialist: ghost, enemyId: 'quiet_ghost',
    doctrinePhase: 'charge_cue', tick: 260, fields: fieldsPort,
  });
  assert.equal(ghost.data._disruptWork, undefined, 'late-window cut still reserves its post-cut breather');
});

test('a disabled anchor controller disarms its snare field and a disabled warden stops screening', () => {
  const h = makeHarness();
  const anchor = {
    id: 20, type: 'ship', alive: true, hull: 120,
    pos: { x: 50, z: 0 },
    data: { enemyTypeId: 'field_anchor_controller', fieldAnchor: { id: 'a1' } },
  };
  let lastArmed = null;
  const fieldsPort = {
    setAnchorArmed(_state, _id, armed, tick) {
      lastArmed = armed;
      return { armed, activateTick: tick + 15, radius: 180 };
    },
  };
  applySpecialistCounterplay({
    state: h.state, specialist: anchor, enemyId: 'field_anchor_controller',
    doctrinePhase: 'anchor_hold', tick: 10, fields: fieldsPort,
  });
  assert.equal(lastArmed, true, 'healthy anchor controller arms snare in anchor_hold');

  anchor.data.disabled = true;
  applySpecialistCounterplay({
    state: h.state, specialist: anchor, enemyId: 'field_anchor_controller',
    doctrinePhase: 'anchor_hold', tick: 12, fields: fieldsPort,
  });
  assert.equal(lastArmed, false, 'disabled anchor controller disarms its snare field');

  // Warden escort screening
  const packmate = { id: 30, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 } };
  const warden = {
    id: 31, type: 'ship', alive: true, team: 1, hull: 150, collisionRadius: 21,
    pos: { x: 50, z: 0 },
    data: { enemyTypeId: 'warden_escort' },
  };
  h.state.entities.set(packmate.id, packmate);
  h.state.entities.set(warden.id, warden);
  h.state.entityList.push(packmate, warden);

  assert.equal(wardScreenTarget(h.state, h.player, packmate, { kind: 'weapon' }), warden);
  assert.equal(publishedWardTarget(h.state), packmate.id);

  warden.data.disabled = true;
  assert.equal(wardScreenTarget(h.state, h.player, packmate, { kind: 'weapon' }), null,
    'disabled warden cannot screen shots');
  assert.equal(refreshWardScreenPublication(h.state), null,
    'ward publication clears when the warden is disabled');
});
