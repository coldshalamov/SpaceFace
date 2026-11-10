// Production worker/native owners, transported facades and real render relevance readers.
// No authored/GPU receipt is fabricated; actual on-screen admission is a browser check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos } from '../scripts/lib/simReadModel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { initCampaignSidecar } from '../src/story/campaign47a/campaignTransitions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_SECTOR_ID } from '../src/features/cinderglassJob/definition.js';
import { mountCinderglassJobPresentation } from '../src/features/cinderglassJob/presentation.js';
import { entityIsExplicitRenderFocus } from '../src/render/runtime/residencyAdmissionQueries.js';
import { willEntityEnterAuthoredUpgradeRunway } from '../src/render/authoredAdmissionPolicy.js';

async function pendingOperation() {
  const lane = createSimHost();
  const init = await lane.init({ profile: 'production', seed: 47,
    scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
  const { state, registry } = lane.host;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.player.docked = false; state.ui.docked = false;
  state.story = { beatIndex: 1, flags: {} };
  initCampaignSidecar(state, state.simTime);
  registry.get('missions')._recordCampaignBookSignal('mission:completed', { storyTag: 'campaign47a:b1:alloy_run' });
  registry.get('world').enterSector(CINDERGLASS_JOB_SECTOR_ID);
  const player = lane.host.runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, team: 0, player: state.player, pos: { x: 13273, z: 8580 } }));
  state.playerId = player.id;
  assert.equal(await registry.get('physics').prepareBackend(state), true);
  const sys = registry.get('cinderglassJob');
  const action = (name, rest = {}) => {
    const p = { action: name, token: sys.token(), operationId: sys._cg.operationId, ...rest };
    lane.host.bus.emit('cinderglassJob:action', p);
    return p.result;
  };
  assert.equal(action('contact').ok, true);
  assert.equal(action('accept', { offerEpoch: sys._cg.offerEpoch }).ok, true);
  const readModel = createReadModel(), infos = new Map();
  applySpawnInfos(readModel, init.initRebuild?.spawnInfos);
  for (let tick = 1; tick <= 10; tick++) {
    const reply = await lane.tick({ tick, steps: 1, commands: [] });
    for (const row of reply.spawnInfos) infos.set(row.entityId, structuredClone(row));
    applySpawnInfos(readModel, reply.spawnInfos);
  }
  const bodies = () => Object.keys(CINDERGLASS_JOB_ROLES).map(key => state.entities.get(sys._cg.entities[key]));
  return { lane, state, registry, sys, action, bodies, readModel, infos };
}

function presentation(state) {
  const bus = createBus(), receipts = [];
  bus.on('cinderglassJob:presentationReady', p => receipts.push(p));
  // The real adapter's environment gate, with deliberately no mounted meshes,
  // compiled pipelines or authored strings to earn an acknowledgement.
  state.render = { scene: {} };
  const ui = mountCinderglassJobPresentation({ state, bus });
  return { ui, bus, receipts };
}

test('default worker originals request the actual main renderer runway without a readiness bypass', async () => {
  const t = await pendingOperation();
  const mirror = { mode: 'paused', ui: {}, player: structuredClone(t.state.player), playerId: t.state.playerId,
    entities: t.readModel.entities, cinderglassJobView: structuredClone(t.state.cinderglassJobView) };
  const p = presentation(mirror);
  try {
    assert.equal(t.sys._cg.phase, 'dispatch');
    assert.equal(t.sys._presentationReady, false);
    assert.equal(t.sys._cg.cohortAdmitted, false);
    const native = t.registry.get('physics')._sg02;
    const identity = t.bodies().map(e => [e.id, e.occupantGeneration]);
    const broker = t.state.entities.get(t.sys._cg.entities.brokerId);
    const carrier = t.state.entities.get(t.sys._cg.entities.carrierId);
    assert.ok(Math.hypot(carrier.pos.x - broker.pos.x, carrier.pos.z - broker.pos.z) > 3000);
    for (const e of t.bodies()) {
      assert.equal(native.records.get(e.id)?.entity, e);
      assert.ok(native.records.get(e.id).colliders.length > 0);
      assert.equal(e.flags.forceRender, undefined, 'presentation does not mutate the worker simulation');
      const facade = mirror.entities.get(e.id);
      assert.equal(facade.occupantGeneration, e.occupantGeneration);
      assert.equal(entityIsExplicitRenderFocus(facade, mirror), true);
      assert.equal(willEntityEnterAuthoredUpgradeRunway(facade, mirror), true);
    }
    applySpawnInfos(t.readModel, t.bodies().map(e => structuredClone(t.infos.get(e.id))));
    p.ui.frame(1, mirror);
    for (const e of t.bodies()) assert.equal(entityIsExplicitRenderFocus(mirror.entities.get(e.id), mirror), true,
      'same-life worker metadata rebuild reacquires the current facade flag object');
    assert.equal(p.receipts.length, 0, 'a preparation request never claims usable GPU assets');
    const entry = t.state.npcJobs.byId[t.sys._cg.entities.carrierJobId], progress = entry.job.progress;
    assert.equal(t.action('retryAdmission').ok, true);
    await t.lane.tick({ tick: 11, steps: 1, commands: [] });
    assert.deepEqual(t.bodies().map(e => [e.id, e.occupantGeneration]), identity);
    assert.equal(entry.job.progress, progress);
    assert.equal(t.sys._cg.approachPrompt.choices.some(c => c.id === 'track'), true);
    assert.equal(t.action('abandon').ok, true);
    mirror.cinderglassJobView = structuredClone(t.state.cinderglassJobView);
    p.ui.frame(1, mirror);
    for (const e of t.bodies()) assert.equal(Object.hasOwn(mirror.entities.get(e.id).flags, 'forceRender'), false);
  } finally { p.ui.destroy(); t.lane.shutdown(); }
});

test('full pending save/Continue gives the new life its own hint and preserves unrelated focus', async () => {
  const t = await pendingOperation();
  const carrier = t.state.entities.get(t.sys._cg.entities.carrierId);
  carrier.flags.forceRender = true;
  carrier.flags.otherOwner = 'retained';
  t.state.entities.get(t.state.playerId).flags.forceRender = true;
  const p = presentation(t.state); // same production owner state also exercises the direct-main lane
  try {
    const save = t.registry.get('save'), envelope = save.serialize('pending-cinderglass');
    const originals = envelope.data.entities.persistent.filter(e => e.data?.cinderglassOperationId === t.sys._cg.operationId);
    assert.equal(originals.length, 8);
    for (const e of originals) {
      assert.equal(e.flags.forceRender, e.id === carrier.id ? true : undefined);
      assert.equal(t.state.entities.get(e.id).flags.forceRender, true, 'capture never releases a live request');
    }
    assert.equal(originals.find(e => e.id === carrier.id).flags.otherOwner, 'retained');
    assert.equal(envelope.data.entities.player.flags.forceRender, true, 'non-Cinder focus serialization is unchanged');
    const identities = originals.map(e => [e.id, e.data.worldRecordId]).sort();
    p.bus.emit('save:restoring', {});
    assert.equal(save._prepareEnvelope(envelope).ok, true, JSON.stringify(save._prepareEnvelope(envelope)));
    assert.equal(save.loadEnvelope(envelope, 'pending-cinderglass'), true);
    await t.lane.tick({ tick: 5, steps: 1, commands: [] });
    p.ui.frame(1, t.state);
    assert.deepEqual(t.bodies().map(e => [e.id, e.data.worldRecordId]).sort(), identities);
    assert.equal(t.sys._cg.phase, 'dispatch');
    for (const e of t.bodies()) assert.equal(e.flags.forceRender, true);
    assert.equal(p.receipts.length, 0);
    assert.equal(t.action('abandon').ok, true);
    p.ui.frame(1, t.state);
    for (const e of t.bodies()) assert.equal(e.flags.forceRender, e.id === carrier.id ? true : undefined);
    assert.equal(t.state.entities.get(carrier.id).flags.otherOwner, 'retained');
  } finally { p.ui.destroy(); t.lane.shutdown(); }
});

test('cleanup never clears a replacement flag object or a recycled numeric occupant', async () => {
  const t = await pendingOperation();
  const p = presentation(t.state);
  try {
    const [replacedFlags, recycled] = t.bodies();
    replacedFlags.flags = { ...replacedFlags.flags, anotherOwner: true };
    const replacement = { ...recycled, occupantGeneration: recycled.occupantGeneration + 1, flags: { forceRender: true } };
    t.state.entities.set(recycled.id, replacement);
    p.bus.emit('game:new', {});
    assert.equal(replacedFlags.flags.forceRender, true);
    assert.equal(replacement.flags.forceRender, true);
    assert.equal(Object.hasOwn(t.bodies()[4].flags, 'forceRender'), false);
  } finally { p.ui.destroy(); t.lane.shutdown(); }
});
