import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createFreightLaneDirector, FREIGHT_FIRST_DEPART_S } from '../src/systems/freightLane.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

test('the real Tethys freight body admits an authored cargo model', () => {
  const state = { simTime: 0, entityList: [], entities: new Map() }, bus = createBus();
  const director = createFreightLaneDirector({ state, bus, helpers: { spawnEntity(spec) {
    const entity = { ...spec, id: state.entityList.length + 1, alive: true };
    state.entityList.push(entity); state.entities.set(entity.id, entity); return entity;
  } } });
  director.init();
  director.arm({ arenaId: 'tethys_hub', at: { x: 0, z: 0 }, installedAt: 0, wave: 1 });
  state.simTime = FREIGHT_FIRST_DEPART_S;
  director.update(1 / 60, state);
  const freight = state.entityList[0];
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const root = factory.build(freight);
  assert.equal(root.userData.visualBuildFailed, undefined);
  assert.ok(root.userData.authoredPackageUrl?.endsWith('/places/place_cargo_pod_standard.glb'));
  assert.equal(typeof root.userData.requestAuthoredUpgrade, 'function');
  assert.equal(root.userData.authoredPendingFallbackDrawn, true, 'freight stays visible while its model loads');
  director.destroy();
});
