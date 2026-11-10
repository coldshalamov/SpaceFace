// A shot-off clamp must not finish the grab it was waiting one step to make.
import test from 'node:test';
import assert from 'node:assert/strict';

import { heistFacilities } from '../src/systems/heistFacilities.js';

function carrierWorld(disabled) {
  const created = [];
  const carrier = {
    id: 2, alive: true, pos: { x: 0, z: 0 },
    data: { heistFacilityRole: 'transport_carrier', launchScheduleId: 'sched' },
  };
  const state = {
    entities: new Map([[2, carrier]]),
    combat: {
      entities: {
        2: { subsystems: { subsystem_transport_clamp: { effectiveDisabled: disabled } } },
      },
    },
  };
  const owned = {
    carrierEntityId: 2,
    schedule: { scheduleId: 'sched' },
    carrierPendingClamp: true,
    carrierReleased: false,
    clampAttachmentId: null,
  };
  const sys = Object.assign(Object.create(heistFacilities), {
    state: { heistFacilities: owned },
    registry: {
      get() {
        return {
          kernel: {
            attachments: {
              create(spec) {
                created.push(spec);
                return { ok: true, attachment: { id: 'clamp-1' } };
              },
            },
          },
        };
      },
    },
    _activeScheduleCapsule() { return { id: 3, alive: true }; },
  });
  return { sys, state, owned, created };
}

test('a dead clamp releases the load instead of finishing the grab', () => {
  const { sys, state, owned, created } = carrierWorld(true);
  sys._stepCarrier(state);
  assert.equal(created.length, 0);
  assert.equal(owned.carrierPendingClamp, false);
  assert.equal(owned.carrierReleased, true);
});

test('a live clamp still closes on the load', () => {
  const { sys, state, owned, created } = carrierWorld(false);
  sys._stepCarrier(state);
  assert.equal(created.length, 1);
  assert.equal(created[0].defId, 'attachment_transport_clamp');
  assert.equal(owned.carrierPendingClamp, false);
  assert.equal(owned.clampAttachmentId, 'clamp-1');
  assert.equal(owned.carrierReleased, false);
});

test('a hull with no clamp subsystem is not treated as shot off', () => {
  const { sys, state } = carrierWorld(false);
  delete state.combat.entities[2].subsystems.subsystem_transport_clamp;
  assert.equal(sys._clampBankOut(state, { id: 2 }), false);
  assert.equal(sys._clampBankOut(state, { id: 9 }), false);
});
