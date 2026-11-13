import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFaunaMesh } from '../src/render/faunaVisuals.js';
import { disposeObjectNode } from '../src/render/renderer.js';

for (const speciesId of ['bolus_hauler', 'bolus_hairball', 'bolus_suture']) {
  test(`${speciesId} reuses identical finishes only within its own lifetime`, () => {
    const entity = () => ({ data: { strainId: 'ashfall_choir', ecology: { speciesId, driveState: 'drift' } } });
    const e = entity(); const otherEntity = entity();
    const first = buildFaunaMesh(e); const other = buildFaunaMesh(otherEntity);
    const firstMaterials = new Set(first.children.map(child => child.material));
    const otherMaterials = new Set(other.children.map(child => child.material));
    assert.ok(firstMaterials.size < first.children.length);
    assert.ok([...firstMaterials].every(material => !otherMaterials.has(material)));
    const before = other.children.map(child => child.material.emissiveIntensity);
    e.data.ecology.driveState = 'charge';
    first.userData.updateAuthoredMotion(e, 0.7, {});
    assert.deepEqual(other.children.map(child => child.material.emissiveIntensity), before);

    const disposals = new Map([...firstMaterials].map(material => [material, 0]));
    for (const material of firstMaterials) material.addEventListener('dispose', () => disposals.set(material, disposals.get(material) + 1));
    let otherDisposals = 0; let sharedGeometryDisposals = 0;
    for (const material of otherMaterials) material.addEventListener('dispose', () => otherDisposals++);
    assert.equal(first.children[0].geometry, other.children[0].geometry);
    first.children[0].geometry.addEventListener('dispose', () => sharedGeometryDisposals++);
    first.traverse(node => disposeObjectNode(node));
    assert.ok([...disposals.values()].every(count => count === 1));
    assert.equal(otherDisposals, 0);
    assert.equal(sharedGeometryDisposals, 0);
    other.userData.updateAuthoredMotion(otherEntity, 1.1, {});
    assert.ok(other.children.every(child => Number.isFinite(child.material.emissiveIntensity)));
  });
}
