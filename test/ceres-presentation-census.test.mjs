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
