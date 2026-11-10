// Actual production factory/override routing, before GPU admission. No asset-ready
// receipt or substitute geometry is supplied. The ordinary page verifies the commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { cinderglassJobIndustrialSpec, cinderglassJobLatchSpec } from '../src/features/cinderglassJob/physical.js';
import { CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_POINTS } from '../src/features/cinderglassJob/definition.js';

const previousDocument = globalThis.document;
test.before(() => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  globalThis.document = { createElement() {
    const canvas = { width: 256, height: 256 }, gradient = { addColorStop() {} };
    const context = { canvas, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {},
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
      createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData() {}, measureText: () => ({ width: 10 }) };
    canvas.getContext = () => context;
    return canvas;
  } };
});
test.after(() => { delete globalThis.__SF_VISUAL_FACTORY_THROW__; globalThis.document = previousDocument; });

const roles = [
  ['latchId', 2745, 'place_salvage_clamp'],
  ['cradleId', 2746, 'place_ceres_section_cradle'],
  ['brokerId', 2747, 'place_ceres_section_cradle'],
  ['laybyId', 2748, 'place_maintenance_gantry'],
];

for (const [key, id, assetId] of roles) test(`${key} selects its explicit original industrial package before the generic type recipe`, () => {
  const descriptor = CINDERGLASS_JOB_ROLES[key];
  const entity = key === 'latchId' ? cinderglassJobLatchSpec(CINDERGLASS_JOB_POINTS.marshal, 0, 'cg:47:1')
    : cinderglassJobIndustrialSpec({ worldRecordId: descriptor.worldRecordId, role: descriptor.role,
      assetId, pos: CINDERGLASS_JOB_POINTS[descriptor.role === 'layby' ? 'pullOff' : descriptor.role],
      scale: descriptor.role === 'layby' ? 3 : .4, name: descriptor.role, operationId: 'cg:47:1' });
  entity.id = id; entity.alive = true; entity.occupantGeneration = id;
  const native = structuredClone({ type: entity.type, id: entity.id, generation: entity.occupantGeneration,
    pos: entity.pos, vel: entity.vel, radius: entity.radius, mass: entity.mass, physicsBody: entity.physicsBody });
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true, directAuthoredMount: true });
  const root = factory.build(entity);
  assert.ok(root);
  assert.equal(root.userData.authoredPackageUrl, entity.data.cinderglassAssetFile);
  assert.equal(root.userData.authoredPackageSlot, 'place');
  assert.equal(root.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(root.userData.boundaryResolvingStandInFit, 2 * entity.data.packagedPropRadius);
  assert.deepEqual({ type: entity.type, id: entity.id, generation: entity.occupantGeneration,
    pos: entity.pos, vel: entity.vel, radius: entity.radius, mass: entity.mass, physicsBody: entity.physicsBody }, native);
});

test('ordinary drone and wreck recipes keep their authored identities', () => {
  const factory = installVisualOverrides(createVisualFactory(), { releaseMode: true, directAuthoredMount: true });
  const drone = factory.build({ id: 2745, type: 'drone', alive: true, radius: 4, data: {} });
  assert.ok(drone.userData.authoredPackageUrl.endsWith('/place_mining_drone.glb'));
  const wreck = factory.build({ id: 2746, type: 'wreck', alive: true, radius: 8, data: {} });
  assert.ok(wreck.userData.authoredPackageUrl.includes('/place_aftermath_'));
});
