import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals } from '../scripts/lib/simReadModel.mjs';
import { syncMawWorksite } from '../src/missions/mawWorksite.js';
import { buildMawWorksiteVisual } from '../src/render/visualFactory.js';

const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
test('authored Maw native radius survives production spawn, rebuild and changed vitals to visual sizing', async () => {
  const host = createSimHost();
  try {
    await host.init({ profile: 'production', seed: 47, scenarioContract: contract });
    const { state, registry, sim } = host.host;
    state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
    const mission = { id: 'test-maw-wire', type: 'tow_recovery', status: 'active', storyTag: 'campaign47a:b3:maw',
      destSectorId: 'sector_ceres_belt', targetEntityIds: [], params: { mawWorksiteVersion: 1, mawStunsNeeded: 3 } };
    state.missions.active.push(mission);
    const owner = { state, helpers: sim.helpers };
    assert.equal(syncMawWorksite(owner, mission, p => ({ x: p.x + 4096, z: p.z })), true);
    const maw = state.entities.get(mission.params.mawBodies[0].entityId);
    assert.ok(maw);
    const physics = registry.get('physics'); assert.equal(await physics.prepareBackend(state), true);
    physics._sg02.syncFromEntities([maw]);
    const nativeRadius = physics._sg02.records.get(maw.id).collider.radius();
    assert.ok(Math.abs(nativeRadius - maw.physicsBody.radius) < 1e-5);
    const readModel = createReadModel(); let tick = 0;
    const publish = async () => {
      const reply = structuredClone(await host.tick({ tick: ++tick, steps: 0, commands: [] }));
      applySpawnInfos(readModel, reply.spawnInfos); applyEntityVitals(readModel, reply.entityVitals);
      return reply;
    };
    await publish();
    const row = readModel.entities.get(maw.id);
    assert.ok(row); assert.ok(Math.abs(row.mawPresentationRadius - nativeRadius) < 1e-5);
    assert.equal(row.physicsBody, undefined, 'the facade receives no invented physics body');
    const initialVisualScale = buildMawWorksiteVisual(row).scale.x;
    host.host.journal.requestRebuild('maw-radius-test'); await publish();
    assert.strictEqual(readModel.entities.get(maw.id), row);
    assert.ok(Math.abs(row.mawPresentationRadius - nativeRadius) < 1e-5, 'full rebuild keeps the same life');
    maw.physicsBody = { ...maw.physicsBody, radius: 30, revision: (maw.physicsBody.revision || 0) + 1 };
    physics._sg02.syncFromEntities([maw]); await publish();
    assert.equal(row.mawPresentationRadius, 30, 'changed native specification crosses the vitals seam');
    const changedVisualScale = buildMawWorksiteVisual(row).scale.x;
    maw.data.mawMissionId = ''; await publish();
    assert.equal(row.mawPresentationRadius, null, 'loss of the exact Maw identity retires the scalar');
    applySpawnInfos(readModel, [{ entityId: maw.id, occupantGeneration: maw.occupantGeneration + 1,
      type: 'asteroid', alive: true, data: {} }]);
    assert.equal(readModel.entities.get(maw.id).mawPresentationRadius, undefined, 'a recycled life cannot inherit it');
    assert.ok(Math.abs(initialVisualScale - nativeRadius / 18) < 1e-5);
    assert.equal(changedVisualScale, 30 / 18);
  } finally { host.shutdown(); }
});
