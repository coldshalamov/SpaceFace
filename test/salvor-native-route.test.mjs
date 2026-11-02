import assert from 'node:assert/strict';
import test from 'node:test';
import { FORGE_ID, SALVOR_POOL, salvorNativeFixture } from './fixtures/salvorNativeFixture.mjs';
import { getFarActor, insertFarActor, promoteFarActorForTargetIdentity,
  restoreFarActorTable, serializeFarActorTable } from '../src/world/farActorTable.js';

test('an adopted scavenger resumes its exact native salvage job after FLEE and completes custody at the wreck',
  { timeout: 120_000 }, async () => {
    const h = await salvorNativeFixture({ adoptedScavenger: true });
    try {
      let cutter = h.scavenger();
      assert.ok(cutter?.data?.jobId,
        `the real salvage:placed event adopts the field scavenger (role=${cutter?.data?.role}, traffic=${cutter?.data?.trafficRole}, sector=${cutter?.data?.sectorId}/${h.state.world.currentSectorId}, target=${h.wreck.type}/${h.wreck.data?.salvagePool && 'pool'})`);
      const jobId = cutter.data.jobId;
      const entry = h.sim.helpers.npcJobs.get(jobId);
      const target = h.wreck;
      const targetId = target.id;
      const worldRecordId = cutter.data.worldRecordId;
      const generation = cutter.occupantGeneration;
      const route = structuredClone(entry.job.route);
      const pool = structuredClone(target.data.salvagePool);
      const quantity = Object.values(pool).reduce((sum, qty) => sum + qty, 0);
      const traffic = h.sim.registry.get('traffic');
      const activeLine = () => Object.values(h.state.combat.attachments.byId || {}).find((line) =>
        line?.state === 'active' && line.controlMode === 'npc_tow'
        && line.ownerId === cutter.id && line.targetId === targetId);
      const reach = () => traffic._salvorReach(cutter, target);

      for (let tick = 0; tick < 180 && !activeLine(); tick += 1) h.step();
      assert.ok(activeLine(), 'the adopted production job first latches its booked wreck');
      assert.equal(entry._salvorBookedTarget?.entity, target,
        'the job retains the exact object generation it originally booked');

      h.sim.bus.emit('combat:damage', {
        targetId: cutter.id, attackerId: h.player.id,
        amount: 5, rawTotal: 5, applied: 5,
      });
      assert.equal(entry.job.phase, 'flee', 'the canonical damage listener interrupts the booked job');
      let resumed = false;
      for (let tick = 0; tick < 900; tick += 1) {
        h.step();
        cutter = h.scavenger();
        if (entry.job.phase !== 'flee') { resumed = true; break; }
      }
      assert.ok(resumed, 'sim-clock threat expiry resumes the original job');
      assert.equal(cutter.data.worldRecordId, worldRecordId);
      assert.equal(cutter.occupantGeneration, generation,
        'this native fixture keeps the same live body generation during the bounded return');
      let distance = Math.hypot(cutter.pos.x - target.pos.x, cutter.pos.z - target.pos.z);
      assert.ok(distance > reach(), `FLEE leaves the actual work radius (distance=${distance.toFixed(1)}, reach=${reach().toFixed(1)})`);
      assert.equal(entry.job.payload.targetId, targetId);
      assert.deepEqual(entry.job.route, route);
      assert.deepEqual(target.data.salvagePool, pool);
      assert.equal(cutter.data.cargoManifest?.totalQty || 0, 0);
      assert.equal(activeLine(), undefined, 'the work line clears during FLEE');

      // Work and loading cannot advance while the real hull is outside the booked workface.
      for (let tick = 0; tick < 120 * 60; tick += 1) {
        h.step();
        cutter = h.scavenger();
        distance = Math.hypot(cutter.pos.x - target.pos.x, cutter.pos.z - target.pos.z);
        if (distance > reach()) {
          assert.notEqual(entry.job.phase, 'work', `no cut while ${distance.toFixed(1)} WU away`);
          assert.notEqual(entry.job.phase, 'load', 'no cargo load while the booked source is out of reach');
        }
        assert.equal(cutter.data.cargoManifest?.totalQty || 0, 0,
          'the far worker has no premature cargo');
        assert.deepEqual(target.data.salvagePool, pool,
          'the same booked wreck pool remains untouched until physical arrival');
        if (activeLine() && distance <= reach()) break;
      }
      assert.ok(activeLine() && distance <= reach(),
        `FlightV3 returns the same worker to the same wreck (phase=${entry.job.phase}, routeIndex=${entry.job.routeIndex}, distance=${distance.toFixed(1)}, intent=${JSON.stringify(cutter.data.intent)}, target=${targetId}, booked=${entry._salvorBookedTarget?.id ?? 'none'}, context=${!!traffic._salvorRoleContext(entry, cutter, entry.job)}, physicalTarget=${traffic._salvorWorkTarget(entry, cutter)?.blocked ? 'blocked' : 'present'})`);
      assert.equal(cutter.data.worldRecordId, worldRecordId);
      assert.equal(cutter.occupantGeneration, generation);
      assert.equal(activeLine().targetId, targetId);

      for (let tick = 0; tick < 3600 && h.events.extraction.length === 0; tick += 1) {
        h.step();
        cutter = h.scavenger();
        distance = Math.hypot(cutter.pos.x - target.pos.x, cutter.pos.z - target.pos.z);
        if (distance > reach()) {
          assert.notEqual(entry.job.phase, 'work', `the cut remains arrival-gated at ${distance.toFixed(1)} WU`);
          assert.notEqual(entry.job.phase, 'load', 'cargo custody cannot finish away from the wreck');
          assert.deepEqual(target.data.salvagePool, pool);
        }
      }
      assert.equal(h.events.extraction.length, 1,
        `the settled native workface completes one real salvage cut (phase=${entry.job.phase}, progress=${entry.job.progress}, distance=${distance.toFixed(1)}, pool=${JSON.stringify(target.data.salvagePool)})`);
      const extraction = h.events.extraction[0];
      assert.equal(extraction.jobId, jobId);
      assert.equal(extraction.salvorId, cutter.id);
      assert.equal(extraction.targetId, targetId);
      assert.equal(extraction.totalQty, quantity);
      assert.deepEqual(target.data.salvagePool, {});
      assert.equal(target.data.salvorClaimedBy, worldRecordId,
        'the exact source stays claimed by the worker carrying its salvage');
      const manifest = cutter.data.cargoManifest;
      assert.equal(manifest.totalQty, quantity);
      assert.equal(manifest.role, 'salvor');
      assert.equal(manifest.lotId, manifest.manifestId);
      assert.equal(manifest.lines.reduce((sum, line) => sum + line.qty, 0), quantity);
      assert.equal(entry.job.payload.targetId, targetId);
      assert.deepEqual(entry.job.route, route);
    } finally {
      h.close();
    }
  });

test('Continue rebinds an adopted scavenger to its saved wreck identity', async () => {
  const h = await salvorNativeFixture({ adoptedScavenger: true, withSave: true });
  try {
    const cutter = h.scavenger();
    assert.ok(cutter?.data?.jobId);
    const jobId = cutter.data.jobId;
    const entry = h.sim.helpers.npcJobs.get(jobId);
    const target = h.wreck;
    const targetPosition = { ...target.pos };
    for (let tick = 0; tick < 120
      && (!entry._salvorBookedTarget || !entry.job.payload.targetIdentity); tick += 1) h.step();
    assert.equal(entry._salvorBookedTarget?.entity, target,
      'the live job first retains the exact target object');
    assert.equal(entry.job.payload.targetIdentity?.kind, 'worldRecord',
      'the ownerless wreck receives its durable identity from the world owner');

    const saveOwner = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saveOwner.serialize('adopted-salvor-target-identity')));
    const savedTargetRecords = Object.values(envelope.data?.world?.records?.byId || {}).filter((record) =>
      record.type === 'wreck' && record.pos?.x === targetPosition.x && record.pos?.z === targetPosition.z);
    assert.equal(savedTargetRecords.length, 1, 'Continue captures one durable record at the booked wreck pose');
    const targetRecordId = savedTargetRecords[0].recordId;
    assert.equal(saveOwner.loadEnvelope(envelope, 'adopted-salvor-target-identity'), true);

    const restoredEntry = h.sim.helpers.npcJobs.get(jobId);
    const restoredCutter = h.scavenger();
    assert.ok(restoredEntry && restoredCutter, 'the same job and worker rematerialize');
    const restoredTarget = h.state.entityList.find((entity) =>
      entity.alive !== false && entity.data?.worldRecordId === targetRecordId);
    assert.ok(restoredTarget, `the original wreck record rematerializes (${targetRecordId})`);

    // Reuse the stale numeric waypoint for a different live wreck. The saved stable identity
    // must select the original body and repair both runtime route references before work begins.
    const decoy = h.sim.spawn({
      type: 'wreck', pos: { x: restoredTarget.pos.x + 35, z: restoredTarget.pos.z },
      radius: 4, mass: 160, hull: 100, hullMax: 100, collides: true,
      flags: { persistent: true },
      data: { salvagePool: { cmdty_scrap_metal: 99 }, sectorId: h.state.world.currentSectorId,
        homeSectorId: h.state.world.currentSectorId },
    });
    restoredEntry.job.payload.targetId = decoy.id;
    restoredEntry.job.route[1].id = `hulk:${decoy.id}`;
    restoredEntry.job.route[1].pos = { x: decoy.pos.x, z: decoy.pos.z };

    const jobs = h.sim.registry.get('npcJobsRuntime');
    const rebound = jobs._findSalvorTractorTarget(restoredEntry, restoredCutter);
    assert.equal(rebound, restoredTarget,
      'the first post-Continue booking resolves the saved durable wreck identity');
    assert.equal(restoredEntry.job.payload.targetId, restoredTarget.id);
    assert.equal(restoredEntry.job.route[1].id, `hulk:${restoredTarget.id}`);
    assert.deepEqual(decoy.data.salvagePool, { cmdty_scrap_metal: 99 },
      'a replacement numeric occupant receives no salvage work or custody');
    assert.equal(restoredEntry._salvorBookedTarget?.entity, restoredTarget,
      'the exact restored object generation becomes the new in-memory sidecar');

    const traffic = h.sim.registry.get('traffic');
    const routePose = { ...restoredEntry.job.route[1].pos };
    restoredTarget.pos.x += 30;
    assert.equal(traffic._retainedAdoptedSalvageTarget(restoredEntry), restoredTarget);
    assert.deepEqual(restoredEntry.job.route[1].pos, routePose,
      'a live physics pose change does not rewrite the saved route waypoint');

    for (const data of [
      { persistenceOwner: 'authoredRecovery', salvagePool: { cmdty_scrap_metal: 2 } },
      { worldSiteId: 'world_site_authored_wreck', salvagePool: { cmdty_scrap_metal: 2 } },
    ]) {
      const protectedTarget = h.sim.spawn({
        type: 'wreck', pos: { x: restoredTarget.pos.x + 80, z: restoredTarget.pos.z },
        radius: 4, mass: 160, hull: 100, hullMax: 100, collides: true,
        flags: { persistent: true },
        data: { ...data, sectorId: h.state.world.currentSectorId, homeSectorId: h.state.world.currentSectorId },
      });
      const protectedEntry = {
        entityId: restoredEntry.entityId,
        job: {
          ...restoredEntry.job,
          route: [{ id: 'cut:hold', pos: { x: 0, z: 0 } },
            { id: `hulk:${protectedTarget.id}`, pos: { x: protectedTarget.pos.x, z: protectedTarget.pos.z } }],
          payload: { role: 'scavenger', targetId: protectedTarget.id, targetType: 'wreck' },
        },
        _salvorBookedTarget: { id: protectedTarget.id, entity: protectedTarget },
      };
      assert.equal(traffic._retainedAdoptedSalvageTarget(protectedEntry), null);
      assert.equal(protectedTarget.data.worldRecordId, undefined,
        'traffic leaves another persistence owner or authored site identity untouched');
    }
  } finally {
    h.close();
  }
});

test('an identity-less early-FLEE booking follows its exact shelved wreck by retained stable key', async () => {
  const h = await salvorNativeFixture({ adoptedScavenger: true });
  try {
    const cutter = h.scavenger();
    const entry = h.sim.helpers.npcJobs.get(cutter.data.jobId);
    const target = h.wreck;
    const traffic = h.sim.registry.get('traffic');
    const world = h.sim.registry.get('world');
    target.data.salvorTargetKey = `salvor:test:${entry.job.id}`;

    // Model the first explicit booking, followed by damage/FLEE before the normal traffic
    // work-target callback could save its key. The target's existing world owner supplies its
    // durable identity before ordinary far-actor shelving.
    assert.equal(h.sim.registry.get('npcJobsRuntime')._findSalvorTractorTarget(entry, cutter), target);
    assert.equal(entry._salvorBookedTarget?.entity, target);
    const sectorId = h.state.world.currentSectorId;
    const active = h.state.world.sectorContents?.[sectorId] || h.state.world.activeSector;
    const recordId = world._assignDurableRecordId(target, sectorId, 'wreck',
      `npc-salvor-target:${entry.job.id}`, active);
    assert.ok(recordId);
    delete entry.job.payload.targetIdentity;
    entry.job.phase = 'flee';
    assert.equal(traffic._salvorWorkTarget(entry, cutter), null,
      'FLEE leaves target recovery to the next ordinary work probe');
    assert.equal(entry.job.payload.targetIdentity, undefined,
      'the interrupted commission path has not yet saved a key');

    insertFarActor(h.state, target, h.state.simTime, h.sim.helpers);
    h.sim.helpers.removeEntity(target.id, { immediate: true, reason: 'virtualize' });
    assert.equal(getFarActor(h.state, target.id)?.data?.worldRecordId, recordId);
    restoreFarActorTable(h.state, JSON.parse(JSON.stringify(serializeFarActorTable(h.state.world.farActors))));
    assert.equal(getFarActor(h.state, target.id)?.physicsBody?.dynamic, true,
      'the save-safe far row retains the target physical-body descriptor');
    h.step(); // Refresh the surviving worker's native pose without updating world residency.
    entry.job.phase = 'transit';

    const descriptor = traffic._salvorWorkTarget(entry, cutter);
    assert.equal(entry.job.payload.targetIdentity?.kind, 'worldRecord',
      'the exact retained booking contributes its stable key after shelving');
    assert.equal(entry.job.payload.targetIdentity?.worldRecordId, recordId);
    assert.deepEqual(descriptor?.pos, { x: target.pos.x, z: target.pos.z },
      'the world owner returns the same shelved wreck pose');
    assert.equal(descriptor.ready, false, 'a pose cannot advance work before physical promotion');
    assert.equal(h.state.entities.has(target.id), false, 'pose following does not revive or replace the wreck');
    assert.equal(getFarActor(h.state, target.id)?.data?.worldRecordId, recordId,
      'the durable far row remains authoritative until the worker reaches the promotion band');

    const promoted = promoteFarActorForTargetIdentity(h.state, entry.job.payload.targetIdentity,
      { type: 'wreck', sectorId }, h.sim.helpers);
    assert.equal(promoted?.physicsBody?.dynamic, true,
      'the ordinary stable-identity promotion restores a dynamic physics body');
    assert.equal(h.sim.registry.get('npcJobsRuntime')._findSalvorTractorTarget(entry, cutter), promoted,
      'the existing attachment admission recognizes the restored exact wreck');
  } finally {
    h.close();
  }
});

for (const drifting of [false, true]) {
  test(`public salvor physically completes the ${drifting ? 'drifting' : 'stationary'} finite haul to Forge`,
    { timeout: 120_000 }, async () => {
      const h = await salvorNativeFixture({ drifting });
      try {
        let dispatchedAt = null, dispatchPos = null, cutter = null;
        for (let tick = 0; tick < 240 * 60; tick++) {
          h.step();
          cutter ||= h.cutter();
          if (cutter && dispatchedAt == null) {
            dispatchedAt = h.state.simTime;
            dispatchPos = { ...cutter.pos };
          }
          if (h.events.unload.some(event => event.intakeResult?.ok)) break;
        }
        const entry = cutter && h.sim.helpers.npcJobs.get(cutter.data.jobId);
        const diagnostic = JSON.stringify({
          drifting, time: h.state.simTime, dispatchedAt, phase: entry?.job?.phase,
          progress: entry?.job?.progress, cutter: cutter?.pos, velocity: cutter?.vel,
          source: h.wreck.pos, yard: h.yard.pos, cargo: cutter?.data?.cargoManifest?.totalQty,
          extractions: h.events.extraction.length, unloads: h.events.unload,
        });
        assert.ok(cutter, `ordinary notice/dispatch must commission the cutter: ${diagnostic}`);
        assert.ok(dispatchedAt >= 18, 'dispatch retains the ordinary salvage notice delay');
        assert.equal(cutter.data.defId, 'ship_ironback',
          'Vesta faction dispatch uses the actual public Ironback cutter, including its PulsePlate drive');
        assert.ok(h.physics._sg02.records.get(cutter.id)?.body.isDynamic(),
          'the working cutter is a real dynamic Rapier body');
        assert.equal(h.events.extraction.length, 1, diagnostic);
        assert.equal(h.events.extraction[0].totalQty, 7);
        assert.deepEqual(h.wreck.data.salvagePool, {}, 'the exact finite wreck pool is drained');
        const cut = h.events.extraction[0];
        assert.ok(Math.hypot(cut.cutterPos.x - dispatchPos.x, cut.cutterPos.z - dispatchPos.z) > 200,
          'the cutter travels to the workpiece instead of completing a stationary timetable');
        const traffic = h.sim.registry.get('traffic');
        assert.ok(Math.hypot(cut.cutterPos.x - cut.sourcePos.x, cut.cutterPos.z - cut.sourcePos.z)
          <= traffic._salvorReach(cutter, h.wreck) + 0.01, 'the cut happens within physical reach');
        assert.ok(Math.hypot(cut.cutterVel.x - cut.sourceVel.x, cut.cutterVel.z - cut.sourceVel.z) <= 8.01,
          'the cutter settles relative to its actual workpiece');
        const accepted = h.events.unload.filter(event => event.intakeResult?.ok);
        assert.equal(accepted.length, 1, diagnostic);
        assert.equal(accepted[0].yardId, FORGE_ID);
        assert.equal(accepted[0].lines.reduce((sum, line) => sum + line.qty, 0), 7);
        assert.ok(Math.hypot(accepted[0].cutterPos.x - h.yard.pos.x, accepted[0].cutterPos.z - h.yard.pos.z)
          <= Math.max(traffic._salvorReach(cutter, h.yard), h.yard.data.dockRadius) + 0.01,
        'intake happens only after the cutter returns to the real yard');
        assert.equal(accepted[0].intakeResult.qty, 7,
          'Forge consumes both legal salvage commodities under its actual fab demand');
        assert.deepEqual(accepted[0].intakeResult.ignoredCommodityIds, []);
        assert.equal(accepted[0].intakeResult.acceptedLines.reduce((sum, line) => sum + line.qty, 0), 7);
        assert.equal(accepted[0].stockAfter.cmdty_scrap_metal,
          accepted[0].stockBefore.cmdty_scrap_metal + SALVOR_POOL.cmdty_scrap_metal,
          'the real economy adds exactly the cut scrap at the actual intake moment');
        assert.equal(accepted[0].stockAfter.cmdty_salvage_electronics,
          accepted[0].stockBefore.cmdty_salvage_electronics + SALVOR_POOL.cmdty_salvage_electronics);
        assert.equal(cutter.data.cargoManifest.totalQty, 0, 'acknowledged intake clears the conserved hold');
        const receipt = structuredClone(accepted[0]);
        const stockBeforeReplay = h.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock;
        h.sim.bus.emit('salvage:npcUnload', receipt);
        assert.equal(h.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock,
          stockBeforeReplay,
          'replaying the same physical delivery cannot add stock twice');
        if (drifting) assert.ok(Math.hypot(h.wreck.pos.x - h.sourceStart.x, h.wreck.pos.z - h.sourceStart.z) > 50,
          'native drift moved the source rather than a fixture relocating the route');
        console.log(`SALVOR_NATIVE drifting=${drifting} dispatch=${dispatchedAt.toFixed(2)}s cut=${cut.at.toFixed(2)}s intake=${accepted[0].at.toFixed(2)}s qty=7`);
      } finally {
        h.close();
      }
    });
}

// Adversarial owner gate, distinct from the two unforced route acceptances above.
test('native custody rejects scalar spoofing, displaced bodies and invalid native motion', { timeout: 120_000 }, async () => {
  const h = await salvorNativeFixture();
  try {
    for (let i = 0; i < 45 * 60 && !h.cutter(); i++) h.step();
    const cutter = h.cutter(); assert.ok(cutter); h.step(2);
    const traffic = h.sim.registry.get('traffic'), native = h.physics._sg02;
    const entry = h.sim.helpers.npcJobs.get(cutter.data.jobId);
    const workerBody = native.records.get(cutter.id).body, sourceBody = native.records.get(h.wreck.id).body;
    const origin = native._frameOrigin || { x: 0, z: 0 };
    const sourcePos = { ...sourceBody.translation() }, workerPos = { ...workerBody.translation() };
    const intent = { kind: 'salvor', jobId: entry.job.id, completed: true, seq: 501, field: entry.job.route[1].id };
    entry.job.phase = 'work'; entry.job.routeIndex = 1; entry.job.progress = .99;
    cutter.pos = { x: sourcePos.x + origin.x - 20, z: sourcePos.z + origin.z };
    cutter.vel = { x: 0, z: 0 };
    assert.equal(traffic._onNpcJobWork(intent), false, 'nearby metadata cannot replace the far native worker');
    workerBody.setTranslation({ x: sourcePos.x - 35, y: sourcePos.y, z: sourcePos.z }, true);
    workerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sourceBody.setTranslation({ x: sourcePos.x + 4000, y: sourcePos.y, z: sourcePos.z }, true);
    assert.equal(traffic._onNpcJobWork(intent), false, 'native source displacement wins over stale metadata');
    sourceBody.setTranslation(sourcePos, true);
    sourceBody.setLinvel({ x: 100, y: 0, z: 0 }, true);
    assert.equal(traffic._onNpcJobWork(intent), false, 'actual relative velocity gates the cut');
    sourceBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sourceBody.setAngvel({ x: 0, y: NaN, z: 0 }, true);
    assert.equal(traffic._onNpcJobWork(intent), false, 'invalid angular state is unresolved, never settled');
    assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
    sourceBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    assert.equal(traffic._onNpcJobWork(intent), true, 'only a finite, present, settled native pair can transfer');
    assert.equal(traffic._onNpcJobWork(intent), true, 'a replay acknowledges existing custody, not another cut');
    assert.equal(h.events.extraction.length, 1); assert.equal(cutter.data.cargoManifest.totalQty, 7);
    workerBody.setTranslation(workerPos, true);
  } finally { h.close(); }
});

test('disabled native work bodies cannot extract, while enabled sleeping bodies may settle', { timeout: 120_000 }, async () => {
  for (const disabled of ['source', 'worker', null]) {
    const h = await salvorNativeFixture();
    try {
      let cutter = null, entry = null;
      for (let i = 0; i < 140 * 60; i++) {
        h.step(); cutter = h.cutter();
        entry = cutter && h.sim.helpers.npcJobs.get(cutter.data.jobId);
        if (entry?.job.phase === 'work'
          && h.sim.registry.get('traffic')._salvorAtTarget(cutter, h.wreck)) break;
      }
      assert.equal(entry?.job.phase, 'work', 'the real route reaches its workpiece before the intervention');
      assert.equal(h.sim.registry.get('traffic')._salvorAtTarget(cutter, h.wreck), true);
      const workerBody = h.physics._sg02.records.get(cutter.id).body;
      const sourceBody = h.physics._sg02.records.get(h.wreck.id).body;
      if (disabled) (disabled === 'source' ? sourceBody : workerBody).setEnabled(false);
      else {
        sourceBody.sleep(); workerBody.sleep();
        assert.equal(sourceBody.isEnabled(), true);
        assert.equal(workerBody.isEnabled(), true);
        assert.equal(sourceBody.isSleeping(), true);
        assert.equal(workerBody.isSleeping(), true);
      }
      entry.job.phase = 'work'; entry.job.routeIndex = 1; entry.job.progress = .99; entry.job.workS = 1;
      h.step(2);
      if (disabled) {
        assert.equal((disabled === 'source' ? sourceBody : workerBody).isEnabled(), false);
        assert.equal(entry.job.progress, .99, `${disabled} disablement must suspend actual job advancement`);
        assert.equal(h.events.extraction.length, 0);
        assert.equal(h.wreck.data.salvagePool.cmdty_scrap_metal, 5);
        assert.equal(cutter.data.cargoManifest.totalQty, 0);
      } else {
        assert.equal(h.events.extraction.length, 1, 'sleeping is not disabled or missing native authority');
        assert.equal(cutter.data.cargoManifest.totalQty, 7);
        assert.deepEqual(h.wreck.data.salvagePool, {});
      }
    } finally { h.close(); }
  }
});

// Ordinary continuation: wait for the empty worker to finish its existing commission, then
// introduce another actual wreck. Dispatch must reuse that idle hull through the normal notice.
test('the same native cutter returns to ordinary work after its complete mixed intake', { timeout: 120_000 }, async () => {
  const h = await salvorNativeFixture();
  try {
    let cutter;
    for (let i = 0; i < 300 * 60; i++) {
      h.step(); cutter ||= h.cutter();
      if (h.events.unload.some(e => e.intakeResult?.ok) && !cutter.data.jobId) break;
    }
    assert.ok(cutter); assert.equal(cutter.data.jobId, undefined, `the completed finite commission releases its empty hull: ${JSON.stringify({ job: h.sim.helpers.npcJobs.get(cutter.data.jobId)?.job, pos: cutter.pos, vel: cutter.vel, yard: h.yard.pos, manifest: cutter.data.cargoManifest })}`);
    assert.equal(cutter.data.cargoManifest.totalQty, 0);
    const originalId = cutter.id;
    const next = h.sim.spawn({ type: 'wreck', pos: { x: h.yard.pos.x + 400, z: h.yard.pos.z + 150 },
      vel: { x: 0, z: 0 }, radius: 4, mass: 160, hull: 100, hullMax: 100, collides: true, flags: { persistent: true },
      data: { salvagePool: { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 }, salvageTimeLeft: 8, parentType: 'ship',
        sectorId: h.state.world.currentSectorId, homeSectorId: h.state.world.currentSectorId } });
    for (let i = 0; i < 300 * 60 && h.events.unload.filter(e => e.intakeResult?.ok).length < 2; i++) h.step();
    assert.equal(h.events.extraction.length, 2);
    const completedWork = h.events.work.filter(event => event.completed);
    assert.equal(completedWork.length, 2, 'each first completed cut succeeds, not a later silent retry');
    assert.deepEqual(h.events.extraction.map(event => event.seq), completedWork.map(event => event.seq));
    assert.equal(h.events.extraction[1].salvorId, originalId, 'the ordinary producer reuses its released worker');
    assert.equal(h.events.extraction[1].targetId, next.id);
    const accepted = h.events.unload.filter(e => e.intakeResult?.ok);
    assert.equal(accepted.length, 2);
    assert.deepEqual(accepted.map(e => e.intakeResult.qty), [7, 4]);
    for (const [index, pool] of [SALVOR_POOL, { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 }].entries()) {
      for (const [id, qty] of Object.entries(pool)) assert.equal(accepted[index].stockAfter[id], accepted[index].stockBefore[id] + qty);
    }
    assert.notEqual(accepted[0].intakeId, accepted[1].intakeId);
    const beforeReplay = Object.fromEntries(Object.keys(SALVOR_POOL).map(id => [id, h.state.economy.markets[FORGE_ID][id].stock]));
    const replay = structuredClone(accepted[0]); h.sim.bus.emit('salvage:npcUnload', replay);
    assert.equal(replay.intakeResult.duplicate, true);
    for (const [id, stock] of Object.entries(beforeReplay)) assert.equal(h.state.economy.markets[FORGE_ID][id].stock, stock);

    assert.equal(cutter.data.cargoManifest.totalQty, 0);
    assert.deepEqual(next.data.salvagePool, {});
    console.log(`SALVOR_NATIVE_REPEAT first=${accepted[0].at.toFixed(2)}s second=${accepted[1].at.toFixed(2)}s sameHull=${originalId}`);
  } finally { h.close(); }
});

test('native mid-cut Continue keeps the original finite workpiece and physically returns its cargo', { timeout: 120_000 }, async () => {
  const h = await salvorNativeFixture({ withSave: true });
  try {
    let cutter, entry;
    for (let tick = 0; tick < 150 * 60; tick++) {
      h.step(); cutter = h.cutter(); entry = cutter && h.sim.helpers.npcJobs.get(cutter.data.jobId);
      if (entry?.job.phase === 'work' && entry.job.progress > 0.2) break;
    }
    assert.equal(entry?.job.phase, 'work');
    assert.equal(h.events.extraction.length, 0);
    const recordId = cutter.data.worldRecordId, jobId = entry.job.id;
    const hardware = {defId:cutter.data.defId,radius:cutter.radius,mass:cutter.mass,physicsBody:structuredClone(cutter.physicsBody)};
    const sourceBody = {radius:h.wreck.radius,mass:h.wreck.mass,collides:h.wreck.collides,physicsBody:structuredClone(h.wreck.physicsBody)};
    const sourceKey = entry.job.payload.targetKey, progress = entry.job.progress;
    const save = h.sim.registry.get('save');
    const envelope = JSON.parse(JSON.stringify(save.serialize('native-salvor-mid-cut')));
    assert.equal(save.loadEnvelope(envelope, 'native-salvor-mid-cut'), true);
    h.physics._finishNativeRestore(); h.state.mode = 'flight';
    assert.equal(await h.physics.prepareBackend(h.state), true); h.step(2);
    const restored = h.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === recordId);
    assert.equal(restored.length, 1);
    [cutter] = restored; entry = h.sim.helpers.npcJobs.get(jobId);
    assert.ok(entry); assert.equal(entry.job.payload.targetKey, sourceKey);
    assert.deepEqual({defId:cutter.data.defId,radius:cutter.radius,mass:cutter.mass,physicsBody:cutter.physicsBody},hardware, 'Continue keeps the public cutter hardware');
    assert.ok(entry.job.progress >= progress && entry.job.progress < 1,
      JSON.stringify({ before: progress, after: entry.job.progress, phase: entry.job.phase,
        jobId, payload: entry.job.payload, extractions: h.events.extraction.length }));
    const traffic = h.sim.registry.get('traffic');
    const source = traffic._resolveSalvorTargetFromWaypoint(entry.job.route[1].id, entry.job.payload);
    assert.ok(source); assert.deepEqual(source.data.salvagePool, SALVOR_POOL);
    assert.deepEqual({radius:source.radius,mass:source.mass,collides:source.collides,physicsBody:source.physicsBody},sourceBody, 'Continue keeps the original source body');
    assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.salvorTargetKey === sourceKey).length, 1);
    for (let tick = 0; tick < 240 * 60 && !h.events.unload.some(e => e.intakeResult?.ok); tick++) h.step();
    assert.equal(h.events.extraction.length, 1);
    const accepted = h.events.unload.filter(e => e.intakeResult?.ok);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].intakeResult.qty, 7);
    for (const [id, qty] of Object.entries(SALVOR_POOL)) {
      assert.equal(accepted[0].stockAfter[id], accepted[0].stockBefore[id] + qty);
    }
    assert.deepEqual(source.data.salvagePool, {});
    assert.equal(cutter.data.cargoManifest.totalQty, 0);
    console.log(`SALVOR_NATIVE_CONTINUE work=${progress.toFixed(4)} intake=${accepted[0].at.toFixed(2)}s qty=${accepted[0].intakeResult.qty}`);
  } finally { h.close(); }
});
