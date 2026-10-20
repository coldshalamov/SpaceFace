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
