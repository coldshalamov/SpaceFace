// §22 B4 — four specialists, each breaking one plan and not the other three.
// Seeds are the caller's; the verbs are pure given the same world.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import {
  applySpecialistCounterplay,
  wardScreenTarget,
} from '../src/ai/specialistCounterplay.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS, FIELD_MAX_ACTIVE } from '../src/data/fields.js';

function specialist(id, x, extras = {}) {
  return {
    id,
    alive: true,
    type: 'ship',
    team: 1,
    pos: { x, z: 0 },
    collisionRadius: 21,
    data: {
      enemyTypeId: extras.enemyTypeId,
      fieldAnchor: extras.fieldAnchor || null,
    },
  };
}

test('each specialist negates only its own plan', () => {
  const player = { id: 1, alive: true, team: 0, pos: { x: 0, z: 0 } };
  const entities = new Map([[1, player]]);
  const state = { playerId: 1, entities, entityList: [player] };
  const calls = [];
  const fieldsPort = {
    disruptNear() {
      calls.push('disrupt');
      return 1;
    },
  };
  const attachments = {
    listForEntity() {
      return [{ id: 'line-1' }];
    },
    breakAttachment() {
      calls.push('cut');
      return { ok: true };
    },
  };

  const cutter = specialist(10, 40, { enemyTypeId: 'tether_control_raider' });
  state.entityList.push(cutter);
  const cut = applySpecialistCounterplay({
    state, specialist: cutter, enemyId: 'tether_control_raider',
    doctrinePhase: 'attach_window', tick: 100, attachments, fields: fieldsPort,
  });
  assert.equal(cut && cut.verb, 'cut_line');
  assert.deepEqual(calls, ['cut']);

  calls.length = 0;
  const disruptor = specialist(11, 40, { enemyTypeId: 'quiet_ghost' });
  const disrupted = applySpecialistCounterplay({
    state, specialist: disruptor, enemyId: 'quiet_ghost',
    doctrinePhase: 'fire_window', tick: 100, attachments, fields: fieldsPort,
  });
  assert.equal(disrupted && disrupted.verb, 'disrupt_field');
  assert.deepEqual(calls, ['disrupt']);

  calls.length = 0;
  const anchor = specialist(12, 80, {
    enemyTypeId: 'field_anchor_controller',
    fieldAnchor: { radius: 235, damping: 3.2 },
  });
  player.pos.x = 100;
  const snare = applySpecialistCounterplay({
    state, specialist: anchor, enemyId: 'field_anchor_controller',
    doctrinePhase: 'hold', tick: 100, attachments, fields: fieldsPort,
  });
  assert.equal(snare && snare.verb, 'snare_field');
  assert.deepEqual(calls, [], 'the anchor does not cut a line or collapse a well');

  const mule = {
    id: 30, alive: true, type: 'ship', team: 1, pos: { x: 200, z: 0 }, collisionRadius: 16,
    data: { enemyTypeId: 'hauler' },
  };
  const warden = specialist(13, 100, { enemyTypeId: 'warden_escort' });
  player.pos.x = 0;
  state.entityList.push(mule, warden);
  const ward = applySpecialistCounterplay({
    state, specialist: warden, enemyId: 'warden_escort',
    doctrinePhase: 'hold', tick: 100, attachments, fields: fieldsPort,
  });
  assert.equal(ward && ward.verb, 'ward_screen');
  assert.equal(ward.targetId, mule.id);
  assert.equal(wardScreenTarget(state, player, mule, { kind: 'collision' }), null,
    'a slam is not a screened shot');
  assert.equal(
    wardScreenTarget(state, player, mule, { kind: 'weapon' }) && warden.id,
    warden.id,
  );
  assert.equal(calls.length, 0, 'the screen does not cut or disrupt');
});

test('a shot at the pack hits the warden, and the other specialists do not steal it', () => {
  const bus = createBus();
  const hits = [];
  bus.on('combat:damage', (payload) => hits.push(payload.targetId));
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, radius: 8,
  };
  const mule = {
    id: 2, type: 'ship', alive: true, team: 1, pos: { x: 200, z: 0 },
    hull: 80, hullMax: 80, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    radius: 12, collisionRadius: 16, data: { enemyTypeId: 'hauler' },
  };
  const warden = {
    id: 3, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 },
    hull: 90, hullMax: 90, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    radius: 14, collisionRadius: 21, data: { enemyTypeId: 'warden_escort' },
  };
  const cutter = {
    id: 4, type: 'ship', alive: true, team: 1, pos: { x: 100, z: 0 },
    hull: 40, hullMax: 40, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    radius: 10, collisionRadius: 18, data: { enemyTypeId: 'tether_control_raider' },
  };
  const state = {
    tick: 8,
    playerId: 1,
    combat: { traces: [] },
    entities: new Map([[1, player], [2, mule], [3, warden], [4, cutter]]),
    entityList: [player, mule, warden, cutter],
    settings: { gameplay: { difficulty: 'standard' } },
  };
  const router = createDamageRouter({
    state, catalog: createCombatCatalog(), bus, helpers: {},
  }, { schedule: () => {} });
  const packet = { channels: { kinetic: 12 }, penetration: 0, shieldBypass: 0 };
  router({
    attackerId: 1, targetId: 2, packet, origin: { kind: 'weapon', id: 'wpn_pulse_laser_s' },
  });
  assert.deepEqual(hits, [3], 'the warden takes the shot meant for the pack');
  assert.equal(mule.hull, 80, 'the mule is unhurt');
  assert.ok(warden.hull < 90, 'the screen spent hull');

  hits.length = 0;
  warden.alive = false;
  const muleHull = mule.hull;
  router({
    attackerId: 1, targetId: 2, packet: { channels: { kinetic: 12 }, penetration: 0, shieldBypass: 0 },
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s' },
  });
  assert.deepEqual(hits, [2], 'without the warden the cutter does not screen');
  assert.ok(mule.hull < muleHull);
});

test('a full player well cap still lets an anchor snare register', () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const bus = createBus();
    const anchor = {
      id: 7, type: 'ship', alive: true, team: 1, pos: { x: 10, z: 4 },
      data: { enemyTypeId: 'field_anchor_controller', fieldAnchor: { defKey: 'anchorSnare', radius: 235, strength: 185, damping: 3.2 } },
    };
    const state = {
      tick: 3, simTime: 1, playerId: 1, mode: 'flight',
      entities: new Map([[7, anchor]]),
      entityList: [anchor],
      fields: null,
    };
    fields.init({ state, bus, helpers: {}, registry: null });
    const kernel = fields._kernel;
    for (let i = 0; i < FIELD_MAX_ACTIVE; i += 1) {
      kernel.register({
        id: `player_well_${i}`,
        kind: 'well',
        center: { x: i, z: 0 },
        radius: 40,
        strength: 10,
        durationS: 5,
        sourceId: 1,
        tag: 'deployed',
      });
    }
    const id = fields._registerAnchoredField(anchor);
    assert.ok(id, 'the anchor snare is not one of the player wells');
    assert.equal(kernel.has(id), true);
  } finally {
    FIELD_FLAGS.enabled = previous;
    if (typeof fields.destroy === 'function') fields.destroy();
  }
});
