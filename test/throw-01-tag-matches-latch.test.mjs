// THROW-01: the aim tag and the latch use the same eligibility. If the target has no free line socket
// the latch is denied (target_socket_unavailable); the aim tag must say so BEFORE the press.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { previewStatusCopy } from '../src/ui/masslineHud.js';

function world() {
  const p = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 16, flags: {} };
  const e = { id: 2, type: 'ship', team: 1, alive: true, pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 16, flags: {} };
  const state = { mode: 'flight', simTime: 1, tick: 60, playerId: 1, player: { tether: {} },
    entities: new Map([[1, p], [2, e]]), entityList: [p, e], combat: null, input: { actions: {} } };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = { createAttachment: (i) => ({ id: i.attachmentId }), cutAttachment: () => true, setAttachmentReel: () => true, getAttachmentTelemetry: () => null };
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus: createBus() });
  return { state, attachments, catalog };
}

test('a body whose line socket is already taken reports target_socket_unavailable before the latch', () => {
  const { attachments, state } = world();
  assert.equal(typeof attachments.targetSocketBlocker, 'function');
  assert.equal(attachments.targetSocketBlocker('tether_standard', 2), null, 'free body: no blocker');
  // Fill the target's sockets with the owner's own lines until the latch itself is refused.
  let refusal = null;
  for (let i = 0; i < 8 && !refusal; i++) {
    const r = attachments.create({ defId: 'tether_standard', ownerId: 1, targetId: 2 });
    if (!r.ok) refusal = r.reason;
  }
  assert.ok(refusal, 'eventually a latch is refused');
  // Whatever refused it, if it is the socket the tag must have said so first.
  if (refusal === 'target_socket_unavailable') assert.equal(attachments.targetSocketBlocker('tether_standard', 2), 'target_socket_unavailable');
  else assert.equal(attachments.targetSocketBlocker('tether_standard', 2), null, 'other refusals are not socket refusals: ' + refusal);
});

test('the denial reads in plain words, not LINE FAILED', () => {
  assert.equal(previewStatusCopy('denied', 'target_socket_unavailable'), 'ALREADY HELD');
});
