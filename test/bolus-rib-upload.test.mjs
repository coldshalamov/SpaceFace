import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../src/data/theBolus.js';
import { syncBolusView, disposeBolusView } from '../src/render/bolusView.js';

test('Bolus ribs upload only on crest and stall pose changes', () => {
  const flags = {};
  const renderer = { scene: new THREE.Scene(), state: { meta: { seed: 4242 }, simTime: 1,
    world: { currentSectorId: BOLUS_SECTOR_ID, alienEcology: { sectorFlags: flags } }, entityList: [] } };
  try {
    syncBolusView(renderer);
    const view = renderer._bolusView;
    const attrs = view.ribs.map(mesh => mesh.geometry.attributes.position);
    const initial = attrs.map(attr => [...attr.array]);
    const versions = () => attrs.map(attr => attr.version);
    const assertAdvance = (prior) => assert.deepEqual(versions(), prior.map(v => v + 1));
    const idleVersion = versions();
    for (let i = 0; i < 120; i++) syncBolusView(renderer);
    assert.deepEqual(versions(), idleVersion, 'quiet frames do not dirty unchanged geometry');

    flags['bolus:crestHoldUntil'] = 10;
    syncBolusView(renderer);
    assertAdvance(idleVersion);
    const crest = attrs.map(attr => [...attr.array]);
    assert.notDeepEqual(crest, initial, 'the crest still opens the ribs');
    const crestVersion = versions();
    syncBolusView(renderer);
    assert.deepEqual(versions(), crestVersion);
    assert.deepEqual(attrs.map(attr => [...attr.array]), crest);

    flags['bolus:peristalsisUntil'] = 10;
    syncBolusView(renderer);
    assertAdvance(crestVersion);
    assert.deepEqual(attrs.map(attr => [...attr.array]), initial, 'stall returns the original geometry');
    const stalledVersion = versions();
    syncBolusView(renderer);
    assert.deepEqual(versions(), stalledVersion);
    delete flags['bolus:peristalsisUntil'];
    syncBolusView(renderer);
    assertAdvance(stalledVersion);
    assert.deepEqual(attrs.map(attr => [...attr.array]), crest, 'resumed crest restores the same geometry');

    const originalGeometry = view.ribs[0].geometry;
    const replacementGeometry = originalGeometry.clone();
    replacementGeometry.attributes.position.array.set(initial[0]);
    view.ribs[0].geometry = replacementGeometry;
    const replacementVersion = replacementGeometry.attributes.position.version;
    const untouchedVersion = attrs[1].version;
    syncBolusView(renderer);
    assert.deepEqual([...replacementGeometry.attributes.position.array], crest[0],
      'replacing a position buffer reapplies the current crest pose');
    assert.equal(replacementGeometry.attributes.position.version, replacementVersion + 1);
    assert.equal(attrs[1].version, untouchedVersion, 'other ribs remain clean');
    originalGeometry.dispose();

    renderer.state.world.currentSectorId = 'other';
    delete flags['bolus:crestHoldUntil'];
    syncBolusView(renderer);
    assert.equal(view.group.visible, false);
    renderer.state.world.currentSectorId = BOLUS_SECTOR_ID;
    syncBolusView(renderer);
    assert.equal(renderer._bolusView, view);
    assert.deepEqual(view.ribs.map(mesh => [...mesh.geometry.attributes.position.array]), initial,
      'sector re-entry applies the latest pose to the retained view');

    flags['bolus:crestHoldUntil'] = 10;
    syncBolusView(renderer);
    renderer.scene = new THREE.Scene();
    syncBolusView(renderer);
    const rebuilt = renderer._bolusView;
    assert.notEqual(rebuilt, view);
    assert.deepEqual(rebuilt.ribs.map(mesh => [...mesh.geometry.attributes.position.array]), crest,
      'a new scene rebuild starts at the active pose');
    disposeBolusView(renderer, { disposeGpu: false });
    syncBolusView(renderer);
    assert.notEqual(renderer._bolusView, rebuilt);
    assert.deepEqual(renderer._bolusView.ribs.map(mesh => [...mesh.geometry.attributes.position.array]), crest,
      'a context-loss retirement rebuilds at the active pose');
  } finally { disposeBolusView(renderer); }
});
