import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ceresWorkfleetCatalogRows } from '../src/render/ceresWorkfleetVisuals.js';
import { authoredCompoundMeasurement, authoredCompoundCoverage } from '../scripts/lib/modelTruthAuthoredCompound.mjs';
import { hasTextureRoleDeclaration, hasUnclassifiedTextures } from '../scripts/lib/modelTextureRoles.mjs';
import { liveSolidGlbCatalog, wholeShipHullPlacement } from '../src/render/partsLibrary.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';

test('Ceres measurement uses explicit native compounds at the runtime source origin', () => {
  for (const row of ceresWorkfleetCatalogRows()) {
    const measurement = authoredCompoundMeasurement(row);
    assert.deepEqual(measurement.fit, {scale: 2, offset: [0, 0, 0]});
    assert.equal(measurement.collider.kind, 'compound');
    assert.equal(measurement.compoundBoxesWU, row.compoundBoxesWU);
    const b = fs.readFileSync(`assets/ships/release/parts/${row.file}`);
    const certificate = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12))).asset.extras.ceresWorkfleet;
    assert.equal(authoredCompoundCoverage([], measurement, certificate).sourceCompoundParity, true);
    assert.throws(() => authoredCompoundCoverage([], measurement, {collision: {boxes: []}}), /disagrees/);
  }
  assert.equal(authoredCompoundMeasurement({fit: 'ship'}), null);
  assert.throws(() => authoredCompoundMeasurement({fit: 'authored-origin'}), /explicit scale/);
});

test('current unrelated catalog fits are retained while the seven Ceres assets keep exactly scale two', () => {
  const catalog = liveSolidGlbCatalog();
  const workfleet = catalog.filter(row => row.family === 'ceres-workfleet');
  assert.equal(workfleet.length, 3);
  const sections = catalog.filter(row => row.id.startsWith('place_ceres_second_measure'));
  assert.equal(sections.length, 4);
  for (const row of sections) {assert.equal(row.fit, 'authored-place-origin'); assert.equal(row.placeScale, 2);}
  assert.equal(catalog.find(row => row.id === 'place_lane_beacon').fit, 'place-scale');
  const record = {assetId: C.assets.breaker.assetId, bounds: {size: [90, 17, 62]}};
  const placement = wholeShipHullPlacement(record);
  assert.deepEqual(placement.position, [0, 0, 0]);
  assert.equal(placement.targetLength * C.assets.breaker.radius / 90, 2);
  assert.equal(wholeShipHullPlacement({...record, assetId: 'ORDINARY'}).targetLength, 1.72);
});

test('Forge role coverage requires every textured material and never pardons an unclassified sibling', () => {
  const good = {getExtras: () => ({spacefaceFinish: 'forge-v1', spacefaceMaterialRole: 'mechanical'})};
  const bad = {getExtras: () => ({spacefaceFinish: 'forge-v1'})};
  assert.equal(hasTextureRoleDeclaration(good), true); assert.equal(hasTextureRoleDeclaration(bad), false);
  const texture = {listParents: () => [good, bad]};
  assert.equal(hasUnclassifiedTextures({listTextures: () => [texture], listMaterials: () => [good, bad]}), true);
  assert.equal(hasUnclassifiedTextures({listTextures: () => [{listParents: () => [good]}], listMaterials: () => [good]}), false);
});

// Generic authored-box rotation qualification, kept on the existing Ceres CI route.
import { distanceToProxy, proxyWorldPrimitives } from '../src/data/collisionProxyManifests.js';

function fixture(angleDeg) {
  const box = { id: 'beam', center: { x: 3, y: 0, z: -5 }, size: { x: 8, y: 2, z: 2 } };
  if (angleDeg !== undefined) box.angleDeg = angleDeg;
  const row = { id: 'fixture', assetId: 'FIXTURE', fit: 'authored-origin', colliderKind: 'compound',
    placeScale: 1, colliderId: 'fixture:compound', referenceState: 'rest', compoundBoxesWU: [box] };
  const source = { name: box.id, centerWU: [3, 0, -5], sizeWU: [8, 2, 2] };
  if (angleDeg !== undefined) source.angleDeg = angleDeg;
  const certificate = { schema: 'spaceface.authoredCompound.v1', assetId: 'FIXTURE', collision: { boxes: [source] } };
  return { row, certificate };
}
const measure = (row, certificate, points = []) => authoredCompoundCoverage(points, authoredCompoundMeasurement(row), certificate);
const rotate = (x, z, degrees) => {
  const a = degrees * Math.PI / 180;
  return { x: 3 + x * Math.cos(a) - z * Math.sin(a), z: -5 + x * Math.sin(a) + z * Math.cos(a) };
};

test('authored OBB yaw reaches radial measurement and exact vertex distance', () => {
  for (const angle of [-330, -210, -150, -90, -30, 0, 15, 30, 90, 135, 180, 360, 721]) {
    const { row, certificate } = fixture(angle);
    assert.equal(authoredCompoundMeasurement(row).collider.primitives[0].rot, angle * Math.PI / 180);
    assert.equal(measure(row, certificate, [rotate(3, .8, angle)]).coverageWu, 0);
    const result = measure(row, certificate, [rotate(4.2, 1.3, angle)]);
    assert.ok(Math.abs(result.coverageWu - Math.hypot(.2, .3)) < 1e-12, `yaw ${angle}: ${result.coverageWu}`);
    assert.equal(result.overTolerance, true);
    assert.equal(result.stickWu, null, 'forward coverage does not claim reverse equivalence');
  }
});

test('native/source yaw disagreement cannot claim source parity', () => {
  const { row, certificate } = fixture(30);
  certificate.collision.boxes[0].angleDeg = -30;
  assert.throws(() => measure(row, certificate), /disagrees/);
  delete certificate.collision.boxes[0].angleDeg;
  assert.throws(() => measure(row, certificate), /disagrees/);
});

test('native planar proxy convention agrees for asymmetric translated boxes', () => {
  for (const angle of [-330, -30, 0, 15, 90, 135, 360]) {
    const { row, certificate } = fixture(angle);
    const primitive = { kind: 'obb', id: 'beam', x: 3, z: -5, hx: 4, hz: 1, angleDeg: angle };
    const native = proxyWorldPrimitives({ radius: 1, pos: { x: 0, z: 0 }, rot: 0 }, { primitives: [primitive] });
    assert.deepEqual(authoredCompoundMeasurement(row).collider.primitives, native);
    for (const point of [{ x: 8, z: -3 }, { x: .5, z: -6.7 }, { x: 2, z: -5 }]) {
      assert.ok(Math.abs(measure(row, certificate, [point]).coverageWu
        - Math.max(0, distanceToProxy(point, primitive))) < 1e-12);
    }
  }
});

test('full-turn equivalent source rotations preserve parity without changing box dimensions', () => {
  for (const [native, source] of [[0, 360], [360, 0], [-330, 30], [30, 390]]) {
    const { row, certificate } = fixture(native);
    certificate.collision.boxes[0].angleDeg = source;
    assert.equal(measure(row, certificate).sourceCompoundParity, true);
    certificate.collision.boxes[0].sizeWU[0] += .00001;
    assert.throws(() => measure(row, certificate), /disagrees/);
  }
});

test('invalid native or certificate yaw is rejected, never silently treated as zero', () => {
  for (const angle of [NaN, Infinity, -Infinity, '30', null]) {
    const { row } = fixture(angle);
    assert.throws(() => authoredCompoundMeasurement(row), /invalid native compound box/);
    const normal = fixture(0);
    normal.certificate.collision.boxes[0].angleDeg = angle;
    assert.throws(() => measure(normal.row, normal.certificate), /disagrees/);
  }
});

test('unsupported rotation representations are refused rather than inferred', () => {
  for (const key of ['rot', 'yaw', 'rotation', 'rotationY']) {
    const { row, certificate } = fixture();
    row.compoundBoxesWU[0][key] = .3;
    assert.throws(() => authoredCompoundMeasurement(row), /invalid native compound box/);
    delete row.compoundBoxesWU[0][key];
    certificate.collision.boxes[0][key] = .3;
    assert.throws(() => measure(row, certificate), /disagrees/);
  }
});

test('rotated boxes cannot enter a certified clear volume beyond their old axis box', () => {
  const { row, certificate } = fixture(45);
  certificate.strictClearVolumes = { rest: [{ x: [5.4, 5.6], z: [-2.6, -2.4] }] };
  assert.throws(() => measure(row, certificate), /clear volume/);
});

test('rotated clear-volume test uses the actual OBB, not its AABB or old axis box', () => {
  const { row, certificate } = fixture(45);
  certificate.strictClearVolumes = { rest: [{ x: [6.5, 6.8], z: [-4.5, -4.2] }] };
  assert.equal(measure(row, certificate).authoredClearVolumesPreserved, true);
});

test('legacy no-yaw boxes retain their exact primitive and coverage behavior', () => {
  const { row, certificate } = fixture();
  assert.deepEqual(authoredCompoundMeasurement(row).collider.primitives,
    [{ id: 'beam', kind: 'obb', x: 3, z: -5, hx: 4, hz: 1, rot: 0 }]);
  assert.equal(measure(row, certificate, [{ x: 8, z: -5 }]).coverageWu, 1);
  certificate.strictClearVolumes = { rest: [{ x: [7, 8], z: [-6, -4] }] };
  assert.equal(measure(row, certificate).authoredClearVolumesPreserved, true, 'touching is not intrusion');
  certificate.strictClearVolumes.rest[0].x[0] = 6.9;
  assert.throws(() => measure(row, certificate), /clear volume/);
  assert.equal(authoredCompoundMeasurement({ fit: 'ship' }), null);
});
