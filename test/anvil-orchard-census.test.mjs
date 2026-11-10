import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { orchardCatalogRows } from '../src/data/anvilOrchardIdentity.js';
import { ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';
import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';
import { authoredCompoundMeasurement, authoredCompoundCoverage, extractAuthoredConvexSource, isAuthoredNonRenderHelper } from '../scripts/lib/modelTruthAuthoredCompound.mjs';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder': MeshoptDecoder});
const rows = orchardCatalogRows();
const source = async row => extractAuthoredConvexSource(await io.read(row.sourceGlbPath), createHash('sha256').update(readFileSync(row.sourceGlbPath)).digest('hex'));

function visibleVertices(document) {
  const points = [];
  for (const node of document.getRoot().listNodes()) {
    if (isAuthoredNonRenderHelper(node)) continue;
    const m = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() || []) {
      const p = primitive.getAttribute('POSITION');
      for (let i = 0; i < p.getCount(); i++) {
        const [x,y,z] = p.getElement(i, []);
        points.push({x:m[0]*x+m[4]*y+m[8]*z+m[12],y:m[1]*x+m[5]*y+m[9]*z+m[13],z:m[2]*x+m[6]*y+m[10]*z+m[14]});
      }
    }
  }
  return points;
}

test('legacy authored box compounds keep exact parity, coverage, and clear-volume refusal', () => {
  const box = {id:'left',center:{x:-3,y:0,z:0},size:{x:2,y:2,z:4}};
  const row = {id:'legacy',assetId:'LEGACY',fit:'authored-origin',placeScale:2,colliderKind:'compound',colliderId:'legacy',referenceState:'rest',compoundBoxesWU:[box]};
  const m = authoredCompoundMeasurement(row);
  assert.deepEqual(m.fit,{scale:2,offset:[0,0,0]});
  assert.deepEqual(m.collider.primitives,[{id:'left',kind:'obb',x:-3,z:0,hx:1,hz:2,rot:0}]);
  const certificate = {schema:'spaceface.authoredCompound.v1',assetId:'LEGACY',collision:{boxes:[{name:'left',centerWU:[-3,0,0],sizeWU:[2,2,4]}]},strictClearVolumes:{rest:[{x:[-1,1],z:[-1,1]}]}};
  assert.equal(authoredCompoundCoverage([{x:-1,z:0}],m,certificate).coverageWu,1);
  assert.equal(authoredCompoundCoverage([],m,certificate).authoredClearVolumesPreserved,true);
  assert.throws(()=>authoredCompoundCoverage([],m,{...certificate,assetId:'IMPOSTOR'}),/identity/);
  assert.throws(()=>authoredCompoundCoverage([],m,{...certificate,strictClearVolumes:{rest:[{x:[-4,0],z:[-1,1]}]}}),/clear volume/);
  assert.equal(authoredCompoundMeasurement({fit:'ship'}),null);
});

test('Orchard catalog has exactly two authored-origin native convex rows without generic replacements', () => {
  const catalog = liveSolidGlbCatalog();
  for (const row of rows) {
    const matches = catalog.filter(r=>r.file===row.file);
    assert.equal(matches.length,1);
    assert.equal(matches[0].fit,'authored-origin');
    assert.equal(matches[0].placeScale,1);
    assert.deepEqual(matches[0].convexPartsWU,row.convexPartsWU);
    assert.equal(matches[0].compoundBoxesWU,undefined);
    assert.deepEqual(authoredCompoundMeasurement(row).collider.primitives,[]);
    assert.throws(()=>authoredCompoundMeasurement({...row,placeScale:2}),/scale one/);
  }
  assert.equal(catalog.find(r=>r.id==='place_lane_beacon').fit,'place-scale');
});

test('canonical accessor convexes preserve every frame part, pivot and separate pod at source precision', async () => {
  for (const row of rows) {
    const certificate = await source(row), m = authoredCompoundMeasurement(row);
    assert.equal(certificate.convexPartsWU.length,row.convexPartsWU.length);
    assert.equal(authoredCompoundCoverage([],m,certificate).sourceCompoundParity,true);
    assert.equal(authoredCompoundCoverage([],m,certificate).sourceDecompositionPreserved,true);
    for (const key of ['assetId','sourceSha','sourceGlbSha256']) assert.throws(()=>authoredCompoundCoverage([],m,{...certificate,[key]:'wrong'}),/identity or hash/);
    assert.throws(()=>authoredCompoundCoverage([],m,{...certificate,convexPartsWU:certificate.convexPartsWU.slice(1)}),/disagrees/);
    const inflated = structuredClone(row);
    inflated.convexPartsWU[0].points[0][0] -= .1;
    assert.throws(()=>authoredCompoundCoverage([],authoredCompoundMeasurement(inflated),certificate),/disagrees|invalid/);
  }
  const document = await io.read(rows[0].sourceGlbPath);
  const rig = document.getRoot().listNodes().find(n=>n.getName()===G.rigs[0].node);
  assert.deepEqual(rig.getTranslation(),G.rigs[0].pivotGltf);
  const collision = document.getRoot().listNodes().find(n=>n.getName()===`COLLISION_${G.rigs[0].partId}`);
  collision.setTranslation([.1,0,0]);
  const altered = extractAuthoredConvexSource(document,rows[0].sourceGlbSha256);
  assert.throws(()=>authoredCompoundCoverage([],authoredCompoundMeasurement(rows[0]),altered),/disagrees/);
});

test('actual source and release visual vertices are measured against exact parts without filling pod sockets', async t => {
  for (const row of rows) {
    const certificate = await source(row), m = authoredCompoundMeasurement(row);
    for (const path of [row.sourceGlbPath,`assets/ships/release/parts/${row.file}`]) {
      const measured = authoredCompoundCoverage(visibleVertices(await io.read(path)),m,certificate);
      t.diagnostic(`${path}: exact XZ coverage ${measured.coverageWu} WU`);
      assert.equal(measured.overTolerance,false);
    }
  }
  const frame = rows[0], m = authoredCompoundMeasurement(frame), certificate = await source(frame);
  for (const pod of G.pods) {
    const clearance = authoredCompoundCoverage([pod.pos],m,certificate).coverageWu;
    assert.ok(clearance>1,`socket ${pod.socket}: real empty center ${clearance}`);
  }
  // A point in a diagonal jaw's AABB can still be outside its actual convex solid.
  const jaw = G.parts.find(p=>p.id===G.rigs[0].partId);
  const xs=jaw.points.map(p=>p[0]),zs=jaw.points.map(p=>p[1]);
  const corner={x:Math.min(...xs)+.001,z:Math.max(...zs)-.001};
  const one={...frame,convexPartsWU:[jaw]};
  const oneSource={...certificate,convexPartsWU:certificate.convexPartsWU.filter(p=>p.id===jaw.id)};
  assert.ok(authoredCompoundCoverage([corner],authoredCompoundMeasurement(one),oneSource).coverageWu>.1);
});
