import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createMercyServiceSystem } from '../src/response/mercyService/index.js';
import { missions } from '../src/systems/missions.js';

async function boot({ missionOwner = false, pos = { x: -50, z: 0 } } = {}) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', seed: 80611,
    systems: [actions, flightV3, physics, combat, tetherGameplay, createMercyServiceSystem(), ...(missionOwner ? [missions] : [])] });
  const state = runtime.state; state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  const { spec } = buildEntitySpawnSpec({ alias: 'player', profile: 'ship.starter', isPlayer: true,
    role: 'player', team: 0, pos, vel: { x: 0, z: 0 }, heading: 0 }, state);
  state.playerId = runtime.spawn(spec).id;
  assert.equal(await runtime.getSystem('physics').prepareBackend(state, {}), true);
  return runtime;
}

test('normal scanner investigation spawns real bodies and the host never integrates their poses', async () => {
  const rt = await boot();
  try {
    const service = rt.getSystem('mercyService');
    rt.bus.emit('scan:pulse', { source: 'player-scanner', pos: rt.state.entities.get(rt.state.playerId).pos });
    assert.ok(service.offer);
    rt.bus.emit('signal:investigate', { signalId: service.offer.signalId });
    assert.ok(service.rt?.focus);
    const body = service.rt.focus.bodyList.find((b) => b.localId === 'capsule');
    const capsule = rt.state.entities.get(body.entityId);
    assert.equal(capsule.physicsBody.dynamic, true);
    assert.equal(capsule.data.placeId, 'place_47a_rescue_capsule');
    const initial = { ...capsule.pos };
    service.update(1 / 60, rt.state);
    assert.deepEqual({ ...capsule.pos }, initial, 'only the physics owner may advance the body');
    queuePhysicsImpulse(capsule, { x: capsule.mass * 2, y: 0, z: 0 });
    for (let i = 0; i < 60; i++) rt.step(1 / 60);
    assert.notEqual(capsule.pos.x, initial.x, 'the late-spawned body must exist in native physics');
    assert.equal(rt.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  } finally { rt.dispose(); }
});

test('normal scanner adoption and investigation accept an actual zero-reward mission', async () => {
  const rt = await boot({ missionOwner: true });
  try {
    const host = rt.getSystem('mercyService');
    rt.bus.emit('scan:pulse', { source: 'player-scanner', pos: rt.state.entities.get(rt.state.playerId).pos });
    const offer = Object.values(rt.state.missions.boards).flatMap((b) => b.slots).find((o) => o.id === host.offer?.id);
    assert.equal(offer?.source, 'mercyService');
    assert.equal(offer.reward_cr, 0);
    rt.bus.emit('signal:investigate', { signalId: host.offer.signalId });
    const active = rt.state.missions.active.find((m) => m.params?.mercyIncidentId);
    assert.ok(active, 'investigation must pass through the missions writer');
    assert.equal(host.rt.focus.offerId, active.id);
    rt.bus.emit('scan:completed', { targetId: null, found: { signals: 1 } });
    assert.equal(active.status, 'active', 'a pulse is not rescue delivery');
    rt.bus.emit('mission:venueProof', { missionId: active.id, source: 'mercyService', receiptId: host.rt.focus.uid, kind: 'rescue-delivered' });
    assert.equal(active.status, 'active', 'an unfinished receipt cannot complete the contract');
    rt.bus.emit('sector:exit', {});
    assert.equal(rt.state.missions.active.some((m) => m.id === active.id), false, 'leaving must resolve the missions-owned active row');
  } finally { rt.dispose(); }
});

test('rescue tools use native constraints and a vent failure becomes a physical child incident', async () => {
  const rt = await boot({ pos: { x: 0, z: 0 } });
  try {
    const host = rt.getSystem('mercyService'); host.startIncident({ incidentId: 'ms_pod_traffic', origin: { x: 0, z: 0 } });
    const capsule = host.rt.focus.bodyList.find((b) => b.localId === 'capsule'), e = rt.state.entities.get(capsule.entityId);
    queuePhysicsImpulse(e, { x: e.mass * 3, y: 0, z: -e.mass * 8 });
    for (let i = 0; i < 210; i++) rt.step(1 / 60);
    const result = host.seatTool({ tool: 'clamp', targetId: e.id });
    assert.equal(result.ok, true, JSON.stringify({ result, player: rt.state.entities.get(rt.state.playerId).pos, capsule: e.pos }));
    assert.ok(host.ctx.helpers.combatPhysics.getAttachmentTelemetry({ attachmentId: capsule.clampId }));
    host.leave();
    assert.equal(host.ctx.helpers.combatPhysics.getAttachmentTelemetry({ attachmentId: capsule.clampId }), null);
    host.startIncident({ incidentId: 'ms_tank_vent', origin: { x: 100, z: 100 } });
    const original = host.rt.focus; const oldIds = original.bodyList.map((b) => b.entityId);
    for (let i = 0; i < 820; i++) rt.step(1 / 60);
    assert.equal(original.failedForward, true);
    assert.equal(host.rt.focus.defId, 'ms_tank_spread');
    assert.ok(host.rt.focus.bodyList.every((b) => rt.state.entities.get(b.entityId)?.physicsBody !== undefined));
    assert.ok(oldIds.every((id) => rt.state.entities.get(id)?.data?.mercyService?.uid !== original.uid), 'recycled ids must belong to the new incident');
  } finally { rt.dispose(); }
});

test('tools refuse distant targets and sector exit removes only owned bodies', async () => {
  const rt = await boot();
  try {
    const service = rt.getSystem('mercyService');
    assert.equal(service.startIncident({ origin: { x: 0, z: 0 } }).ok, true);
    const subject = service.rt.focus.bodyList.find((b) => b.localId === 'capsule');
    assert.equal(service.seatTool({ tool: 'stabilizer', targetId: subject.entityId }).ok, false);
    const foreign = rt.spawn({ type: 'payload', pos: { x: 500, z: 500 }, radius: 3, mass: 4, collides: true });
    rt.bus.emit('sector:exit', {});
    assert.equal(rt.state.entities.has(subject.entityId), false);
    assert.equal(rt.state.entities.get(foreign.id), foreign);
  } finally { rt.dispose(); }
});

test('live rescue state round-trips without spawning duplicate actors', async () => {
  const rt = await boot();
  try {
    const service = rt.getSystem('mercyService');
    service.startIncident({ origin: { x: 0, z: 0 } });
    rt.step(1 / 60);
    const saved = JSON.parse(JSON.stringify(service.serialize()));
    const ids = service.rt.focus.bodyList.map((b) => b.entityId);
    assert.equal(service.deserialize(saved), true);
    assert.deepEqual(service.rt.focus.bodyList.map((b) => b.entityId).sort((a, b) => a - b), ids.sort((a, b) => a - b));
    assert.equal(service.deserialize({ schema: 0 }), false);
    assert.equal(Object.values(service.rt.incidents).length, 1);
  } finally { rt.dispose(); }
});
