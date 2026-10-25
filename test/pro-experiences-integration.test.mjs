import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { SITE as INDUSTRIAL_SITE, sitePoint } from '../src/features/industrialDisasters/scenarios.js';
import { findTenderBody, TENDER_BODY_ID } from '../src/features/salvageTender/physical.js';

// Production-manifest/save-composition evidence. Fixture relocation isolates the save
// boundary; these five tests are not keyboard playthroughs or visual acceptance.
const DT = 1 / 60;
const SECTOR = 'sector_ceres_belt';
const FIELDS = ['shipbreakingYard', 'rigWorkshop', 'salvageTender', 'salvageOutfits', 'industrialDisasters'];
const clone = value => JSON.parse(JSON.stringify(value));
const okay = result => assert.equal(result?.ok, true, result?.reason || JSON.stringify(result));
const local = point => sectorLocalToGlobalForSector(point, SECTOR);

function host(point) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 1 });
  const state = runtime.state;
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.player.ownedShips = [{ defId: 'ship_kestrel', vesselId: 'pro-experiences:pilot',
    fittings: Array(7).fill(null), fittedInstances: {} }];
  state.player.activeShipIndex = 0;
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, pos: point, fittings: [],
  }));
  state.playerId = player.id;
  runtime.getSystem('world').enterSector(SECTOR, { noTeleport: true, placePlayer: false, continuous: true });
  runtime.getSystem('world').relocatePlayerInSector({ ...point, heading: 0 }, { reason: 'pro-experiences-save-fixture' });
  runtime.getSystem('economy').grantCredits(10_000, 'pro-experiences-save-fixture');
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  return runtime;
}

function player(runtime) { return runtime.state.entities.get(runtime.state.playerId); }
function relocate(runtime, point) {
  runtime.getSystem('world').relocatePlayerInSector({ ...point, heading: 0 }, { reason: 'pro-experiences-save-fixture' });
}
async function admit(runtime) {
  assert.equal(await runtime.getSystem('physics').prepareBackend(runtime.state), true);
  runtime.getSystem('physics').update(DT, runtime.state);
}
function requestEncounter(runtime, shapeId, anchor, choiceId, immediateOutcome = null) {
  const encounterId = `production-save:${shapeId}`;
  let resolution;
  const off = runtime.bus.on('encounter:resolved', receipt => {
    if (receipt.encounterId === encounterId) resolution = receipt;
  });
  const result = runtime.getSystem('encounterDirector').requestAuthoredEncounter({
    shapeId, encounterId, sectorId: SECTOR, anchor,
    zoneId: 'pro-experiences-save', zoneName: 'Save composition fixture',
    zoneType: 'mining_belt', zoneRadius: 600, respectPacing: false,
  });
  off();
  if (immediateOutcome) {
    assert.equal(result.reason, 'resolved_on_fire');
    assert.equal(resolution?.outcome, immediateOutcome, 'discovery resolves successfully into the persistent feature');
  } else okay(result);
  if (choiceId) runtime.bus.emit('encounter:choose', { encounterId, choiceId });
  return encounterId;
}
function originals(runtime, owner) {
  return runtime.state.entityList.filter(entity => entity.alive !== false && entity.data?.persistenceOwner === owner)
    .map(entity => entity.data.worldRecordId || entity.data.identityKey).filter(Boolean).sort();
}

const scenarios = [
  {
    id: 'shipbreakingYard', point: local({ x: -1850, z: 1188 }),
    async start(runtime) {
      const owner = runtime.getSystem('shipbreakingYard');
      requestEncounter(runtime, 'pro_shipbreaking_yard', player(runtime).pos, null, 'discovered');
      assert.equal(runtime.state.shipbreakingYard.discovered, true);
      const job = owner.getJob('lark');
      let engine = owner.physics.body(job, 'engine');
      relocate(runtime, { x: engine.pos.x, z: engine.pos.z - 70 });
      await admit(runtime); owner.update(DT, runtime.state);
      const before = runtime.state.player.credits;
      okay(owner.accept('lark', runtime.state.shipbreakingYard.revision));
      assert.equal(runtime.state.player.credits, before - 80);
      okay(owner.disconnect('engine-clamp', runtime.state.shipbreakingYard.revision, job.id));
      engine = owner.physics.body(job, 'engine');
      const receiver = owner.receiver();
      // Delivery-gate fixture: the feature suite separately proves actual flight-input towing.
      engine.pos.set(receiver.pos.x, 0, receiver.pos.z); engine.vel.set(0, 0, 0); engine.angVel = 0;
      relocate(runtime, { x: receiver.pos.x + 52, z: receiver.pos.z });
      runtime.getSystem('physics').update(DT, runtime.state);
      okay(getCombatKernel(owner.ctx).attachments.create({ defId: 'attachment_massline',
        ownerId: runtime.state.playerId, targetId: engine.id,
        sourceWorld: player(runtime).pos, targetWorld: engine.pos }));
      okay(owner.deliver('engine', runtime.state.shipbreakingYard.revision, job.id));
      assert.equal(job.modules.engine.status, 'delivered');
    },
    identity(runtime) {
      const owner = runtime.getSystem('shipbreakingYard'), saved = owner.serialize();
      const job = saved.jobs[saved.slots.lark];
      assert.equal(job.modules.engine.status, 'delivered');
      assert.ok(job.modules.engine.receipt?.credits > 0);
      assert.equal(owner.physics.body(owner.getJob('lark'), 'engine'), null);
      return { paidCr: job.paidCr, receipt: job.modules.engine.receipt,
        connection: job.couplings['engine-clamp'].status, originals: originals(runtime, 'shipbreakingYard') };
    },
  },
  {
    id: 'rigWorkshop', point: local({ x: 1100, z: -1100 }),
    async start(runtime) {
      const owner = runtime.getSystem('rigWorkshop');
      requestEncounter(runtime, 'pro_rig_workshop', player(runtime).pos, null, 'workshop_charted');
      const workshop = runtime.state.rigWorkshop;
      assert.ok(workshop.bench, 'the ordinary director charts the physical bench');
      relocate(runtime, workshop.bench.pos);
      await admit(runtime); owner.update(DT, runtime.state);
      await admit(runtime); owner.update(DT, runtime.state);
      const rig = workshop.rigs[0];
      assert.equal(workshop.rigs.length, 2);
      const prompt = workshop.prompt;
      runtime.bus.emit('rigWorkshop:choose', { promptId: prompt.id, revision: prompt.revision, choiceId: 'care' });
      const care = workshop.prompt;
      runtime.bus.emit('rigWorkshop:choose', { promptId: care.id, revision: care.revision, choiceId: 'name' });
      const names = workshop.prompt;
      runtime.bus.emit('rigWorkshop:choose', { promptId: names.id, revision: names.revision, choiceId: 'name:The Patient Argument' });
      assert.equal(rig.name, 'The Patient Argument');
      okay(owner.dispatch('preview', { partType: 'collector', parentId: rig.partIds[0], mount: 'starboard' }));
      okay(owner.dispatch('commit'));
      for (let tick = 0; tick < 3; tick++) { await admit(runtime); owner.update(DT, runtime.state); }
      assert.equal(rig.modified, true);
      assert.equal(workshop.stock, 7);
    },
    identity(runtime) {
      const saved = runtime.getSystem('rigWorkshop').serialize();
      assert.equal(saved.workshop.rigs[0].name, 'The Patient Argument');
      assert.equal(saved.workshop.rigs[0].modified, true);
      return { stock: saved.workshop.stock,
        rigs: saved.workshop.rigs.map(rig => ({ id: rig.id, name: rig.name, parts: Object.values(rig.partTokens).sort(),
          connections: rig.connections.map(edge => [edge.id, edge.state]) })),
        originals: originals(runtime, 'rigWorkshop') };
    },
  },
  {
    id: 'salvageTender', point: local({ x: 1100, z: 1100 }),
    async start(runtime) {
      const anchor = { x: player(runtime).pos.x - 100, z: player(runtime).pos.z };
      requestEncounter(runtime, 'pro_salvage_tender', anchor, 'inspect');
      const owner = runtime.getSystem('salvageTender'), body = findTenderBody(runtime.state);
      assert.ok(body, 'the actual encounter introduces an original tender');
      relocate(runtime, { x: body.pos.x + 90, z: body.pos.z });
      await admit(runtime);
      const request = { action: 'accept', revision: runtime.state.salvageTender.revision };
      runtime.bus.emit('salvageTender:action', request); okay(request.result);
      assert.equal(runtime.state.salvageTender.rescueAccepted, true);
    },
    identity(runtime) {
      const saved = runtime.getSystem('salvageTender').serialize(), body = findTenderBody(runtime.state);
      assert.ok(body, 'the complete save restores the original tender');
      assert.equal(body.data.worldRecordId || body.data.identityKey, TENDER_BODY_ID);
      assert.equal(saved.rescueAccepted, true);
      return { accepted: saved.rescueAccepted, stage: saved.stage, hull: body.hull,
        identity: body.data.worldRecordId || body.data.identityKey,
        supplies: saved.physical.recovery.map(row => [row.id, row.status, row.manifest]) };
    },
  },
  {
    id: 'salvageOutfits', point: local({ x: 1200, z: 1000 }),
    async start(runtime) {
      const anchor = { x: player(runtime).pos.x, z: player(runtime).pos.z - 180 };
      const id = requestEncounter(runtime, 'pro_salvage_outfits', anchor);
      const meeting = runtime.state.salvageOutfits.meetings[id];
      assert.ok(meeting, 'the actual director starts a finite shared salvage meeting');
      await admit(runtime);
      runtime.getSystem('salvageOutfits').update(DT);
      assert.ok(meeting.offer?.id, 'ordinary meeting terms are available');
      runtime.bus.emit('salvageOutfits:choose', { meetingId: id, offerId: meeting.offer.id, choiceId: 'split' });
      assert.equal(meeting.agreement?.type, 'split');
    },
    identity(runtime) {
      const saved = runtime.getSystem('salvageOutfits').serialize();
      const meeting = saved.meetings['production-save:pro_salvage_outfits'];
      assert.equal(meeting.agreement?.type, 'split');
      const bodies = Object.values(meeting.bodies).map(row => {
        const matches = runtime.state.entityList.filter(entity => entity.alive !== false
          && (entity.data?.worldRecordId === row.key || entity.data?.identityKey === row.key));
        assert.equal(matches.length, row.status === 'live' ? 1 : 0, `one original for ${row.key}`);
        return [row.key, row.claim, row.status, row.pool];
      });
      return { agreement: meeting.agreement, bodies, memory: saved.memory };
    },
  },
  {
    id: 'industrialDisasters', point: sitePoint({ x: 0, z: 150 }),
    async start(runtime) {
      const owner = runtime.getSystem('industrialDisasters');
      await admit(runtime); owner.update(DT);
      assert.equal(runtime.state.industrialDisasters.site.discovered, true);
      assert.equal(owner.site.crisis.phase, 'preview');
      const request = { action: 'accept', siteId: INDUSTRIAL_SITE.id };
      runtime.bus.emit('industrialDisasters:command', request); okay(request.result);
      owner.update(DT); runtime.getSystem('physics').update(DT, runtime.state);
    },
    identity(runtime) {
      const owner = runtime.getSystem('industrialDisasters'), saved = owner.serialize();
      assert.equal(saved.site.crisis.phase, 'active');
      const bodies = owner.physical.bodies();
      assert.ok(bodies.transport && bodies.crewA && bodies.storageA, 'native crisis originals survive the full envelope');
      return { scenarioId: saved.site.crisis.scenarioId, cycle: saved.site.crisis.cycle,
        phase: saved.site.crisis.phase, receipts: saved.site.rewardReceipts,
        roles: Object.keys(bodies).sort(), transportHull: bodies.transport.hull };
    },
  },
];

for (const scenario of scenarios) test(`production ${scenario.id}: registered encounter/intent, full envelope, cold originals and old-slot clearing`, async () => {
  const source = host(scenario.point);
  let destination;
  try {
    for (const id of FIELDS) assert.ok(source.getSystem(id), `${id} must be in the real production manifest`);
    const oldData = source.getSystem('save').serializeData();
    for (const key of FIELDS) delete oldData[key];
    await scenario.start(source);
    const before = scenario.identity(source), credits = source.state.player.credits;
    const envelope = source.getSystem('save').serialize(`pro-experiences:${scenario.id}`);
    for (const key of FIELDS) assert.ok(Object.hasOwn(envelope.data, key), `${key} belongs to the coherent envelope`);
    const industrial = source.getSystem('industrialDisasters');
    source.dispose();
    assert.doesNotThrow(() => industrial.serialize(), 'queued late capture after teardown remains lifecycle-safe');
    destination = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 2 });
    assert.equal(await destination.getSystem('save').loadEnvelope(clone(envelope), `pro-experiences:${scenario.id}`), true);
    destination.state.mode = 'flight';
    await admit(destination);
    // One owner tick admits any fallback originals after the shared generic/native restore.
    for (const id of FIELDS) destination.getSystem(id).update(DT, destination.state);
    assert.deepEqual(scenario.identity(destination), before);
    assert.equal(destination.state.player.credits, credits, 'cold load cannot replay a claim or payout');
    assert.equal(destination.getSystem('save')._restore(clone(oldData), 'pre-experience-slot').restored, true);
    assert.equal(destination.state.shipbreakingYard.discovered, false);
    assert.equal(destination.state.salvageTender.discovered, false);
    assert.deepEqual(destination.state.salvageOutfits.meetings, {});
    assert.equal(destination.state.industrialDisasters.site.crisis, null);
    assert.equal(destination.state.rigWorkshop.bench, null);
  } finally { destination?.dispose(); source.dispose(); }
});
