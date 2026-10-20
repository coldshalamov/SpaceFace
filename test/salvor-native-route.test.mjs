import assert from 'node:assert/strict';
import test from 'node:test';
import { FORGE_ID, SALVOR_POOL, salvorNativeFixture } from './fixtures/salvorNativeFixture.mjs';

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
        assert.equal(accepted[0].intakeResult.qty, SALVOR_POOL.cmdty_scrap_metal,
          'the existing yard policy accepts the scrap line without reinterpreting the other cargo');
        assert.deepEqual(accepted[0].intakeResult.ignoredCommodityIds, ['cmdty_salvage_electronics']);
        assert.equal(accepted[0].stockAfter.cmdty_scrap_metal,
          accepted[0].stockBefore.cmdty_scrap_metal + SALVOR_POOL.cmdty_scrap_metal,
          'the real economy adds exactly the cut scrap at the actual intake moment');
        assert.equal(accepted[0].stockAfter.cmdty_salvage_electronics,
          accepted[0].stockBefore.cmdty_salvage_electronics);
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
