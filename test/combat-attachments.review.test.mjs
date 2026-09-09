import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';

test('broken attachment history stays bounded during a long tether session', () => {
  const state = {
    tick: 0,
    combat: {
      attachments: { nextId: 1, byId: {} },
    },
  };
  const service = createAttachmentService({
    state,
    catalog: { attachments: new Map([['fixture', { id: 'fixture', cues: {} }]]) },
    helpers: { combatPhysics: { cutAttachment: () => true } },
    bus: null,
  });

  for (let i = 0; i < 192; i++) {
    state.tick = i;
    const attachment = {
      id: `att_${String(i + 1).padStart(6, '0')}`,
      defId: 'fixture',
      ownerId: 'player',
      targetId: `target_${i}`,
      state: 'active',
      physicsHandle: i,
      lastTension: 0,
      lastImpulse: 0,
    };
    state.combat.attachments.byId[attachment.id] = attachment;
    assert.equal(service.breakAttachment(attachment, 'test').ok, true);
  }

  assert.ok(
    Object.keys(state.combat.attachments.byId).length <= 128,
    'completed tether records must not grow without bound',
  );
});
