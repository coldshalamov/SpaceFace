import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { ensureCombatState } from '../src/combat/runtime.js';
import { serializeCombatState, restoreCombatState, resumeCeresWorkfleetAttachments } from '../src/combat/persistence.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
const clone = x => JSON.parse(JSON.stringify(x));
function fixture(offset = 0) {
  const state = createGameState(47); state.world.currentSectorId = C.sectorId;
  const anchor = {id: 11 + offset, occupantGeneration: 3, type: 'payload', alive: true, hull: 100, mass: 6000,
    flags: { persistent: true }, physicsBody: { dynamic: false }, pos: {x: 1, z: 2}, vel: {x: 0, z: 0},
    data: {ceresWinchAnchor: 0, ceresWinchIdentity: 'ceres:second_measure:winch:0', combatProfileId: 'combat_profile_lantern_hardware', sectorId: C.sectorId}};
  const plate = {id: 12 + offset, occupantGeneration: 4, type: 'wreck', alive: true, hull: 100, mass: C.existing.section.mass,
    pos: {x: 20, z: 30}, vel: {x: 4, z: 5}, angVel: .3, flags: {}, physicsBody: {dynamic: true},
    data: {worldRecordId: C.identities.payload, worldSiteId: C.siteId, worldSitePayloadId: C.existing.section.payloadId,
      worldSiteStructural: true, combatProfileId: 'combat_profile_tether_anchor', persistenceOwner: 'asteroidSites'}};
  state.entities = new Map([[anchor.id, anchor], [plate.id, plate]]); state.entityList = [anchor, plate];
  state.npcJobs = {ceresWorkfleet: {phase: 'player-retained'}, ceresAnchorSwing: {schemaVersion: 1, lineId: 'att_000001', anchorIndex: 0}};
  state.sites = {worldById: {[C.siteId]: {manifestId: C.siteId, sectorId: C.sectorId,
    payloads: {[C.existing.section.payloadId]: {status: 'released', remainingHull: 100, destroyed: false}}}}};
  ensureCombatState(state);
  const row = {id: 'att_000001', state: 'active', defId: 'attachment_transport_clamp', controlMode: 'ceres_anchor_winch',
    ownerId: anchor.id, targetId: plate.id, ownerGeneration: 3, targetGeneration: 4, sourceSocketId: 'socket_lantern_clamp',
    targetSocketId: 'socket_tether_anchor', sourceAnchorLocal: {x: 0, z: 0}, targetAnchorLocal: {x: 0, z: 0}, restLength: 18.25};
  state.combat.attachments.byId[row.id] = row;
  return {state, anchor, plate, row};
}
function saved() { return serializeCombatState(fixture().state); }
function restore(h, payload, deferred = false) {
  return restoreCombatState(h.state, payload, ref => ref.kind === 'persistent' ? h.anchor.id : null,
    {deferCeresAttachments: deferred});
}
test('anchor constraint survives remapped Continue with exact length and unchanged momentum', () => {
  const payload = saved(); assert.ok(payload.attachments.byId.att_000001);
  const h = fixture(100), motion = clone({pos: h.plate.pos, vel: h.plate.vel, angVel: h.plate.angVel});
  assert.equal(restore(h, payload).restoredAttachments, 1);
  const row = h.state.combat.attachments.byId.att_000001;
  assert.equal(row.ownerId, h.anchor.id); assert.equal(row.targetId, h.plate.id); assert.equal(row.restLength, 18.25);
  assert.deepEqual({pos: h.plate.pos, vel: h.plate.vel, angVel: h.plate.angVel}, motion);
});
test('creation callback snapshot permits exactly one committed line before lineId publication', () => {
  const h = fixture(); h.state.npcJobs.ceresAnchorSwing.lineId = null;
  assert.ok(serializeCombatState(h.state).attachments.byId.att_000001);
  h.state.combat.attachments.byId.att_000002 = {...h.row, id: 'att_000002'};
  assert.deepEqual(serializeCombatState(h.state).attachments.byId, {});
});
for (const kind of ['dead', 'stale', 'duplicate', 'owned', 'wrong-job', 'wrong-sector', 'foreign-line']) {
  test(`refuses ${kind} anchor custody`, () => {
    const h = fixture();
    if (kind === 'dead') h.anchor.hull = 0;
    if (kind === 'stale') h.anchor.occupantGeneration++;
    if (kind === 'duplicate') h.state.entities.set(99, {...clone(h.anchor), id: 99});
    if (kind === 'owned') h.anchor.data.controlLease = 'foreign';
    if (kind === 'wrong-job') h.state.npcJobs.ceresAnchorSwing.anchorIndex = 1;
    if (kind === 'wrong-sector') h.state.world.currentSectorId = 'elsewhere';
    if (kind === 'foreign-line') h.state.combat.attachments.byId.att_000002 = {...h.row, id: 'att_000002', controlMode: 'industrial'};
    assert.equal(serializeCombatState(h.state).attachments.byId.att_000001, undefined);
  });
}
test('deferred target restore waits, re-saves remapped anchor reference, rejects changed life', () => {
  const payload = saved(), h = fixture(100); h.state.entities.delete(h.plate.id);
  restore(h, payload, true); assert.equal(resumeCeresWorkfleetAttachments(h.state).pending, 1);
  assert.equal(serializeCombatState(h.state).attachments.byId.att_000001.ownerRef.saveId, String(h.anchor.id));
  h.anchor.occupantGeneration++; h.state.entities.set(h.plate.id, h.plate);
  assert.equal(resumeCeresWorkfleetAttachments(h.state).dropped, 1);
});
test('deferred target restore resumes when original body materializes', () => {
  const payload = saved(), h = fixture(100); h.state.entities.delete(h.plate.id);
  restore(h, payload, true); assert.equal(resumeCeresWorkfleetAttachments(h.state).pending, 1);
  h.state.entities.set(h.plate.id, h.plate); assert.equal(resumeCeresWorkfleetAttachments(h.state).restoredAttachments, 1);
});
for (const kind of ['dead', 'duplicate', 'owned', 'missing', 'wrong-job', 'destroyed-plate', 'forged-controller']) {
  test(`Continue rejects ${kind} rather than restoring anchor custody`, () => {
    const payload = saved(), h = fixture(100);
    if (kind === 'dead') h.anchor.hull = 0;
    if (kind === 'duplicate') h.state.entities.set(99, {...clone(h.anchor), id: 99});
    if (kind === 'owned') h.anchor.playerOwned = true;
    if (kind === 'missing') h.state.entities.delete(h.anchor.id);
    if (kind === 'wrong-job') h.state.npcJobs.ceresAnchorSwing.lineId = 'att_000009';
    if (kind === 'destroyed-plate') h.state.sites.worldById[C.siteId].payloads[C.existing.section.payloadId].destroyed = true;
    if (kind === 'forged-controller') payload.attachments.byId.att_000001.controllerRef = {kind: 'player'};
    assert.equal(restore(h, payload).restoredAttachments, 0);
    assert.equal(h.state.combat.attachments.byId.att_000001, undefined);
  });
}
test('ordinary player Line to original plate coexists across Continue', () => {
  const h = fixture();
  const player = {id: 50, type: 'ship', alive: true, hull: 100, occupantGeneration: 7,
    flags: {}, data: {}, pos: {x: 30, z: 40}};
  h.state.entities.set(player.id, player); h.state.entityList.push(player); h.state.playerId = player.id;
  h.state.combat.attachments.byId.att_000002 = {...h.row, id: 'att_000002', ownerId: player.id,
    ownerGeneration: 7, defId: 'tether_standard', controlMode: undefined, sourceSocketId: 'socket_tether_spool'};
  const payload = serializeCombatState(h.state);
  assert.deepEqual(Object.keys(payload.attachments.byId), ['att_000001', 'att_000002']);
  const summary = restoreCombatState(h.state, payload, ref => ref.kind === 'player' ? player.id : h.anchor.id);
  assert.equal(summary.restoredAttachments, 2);
});
