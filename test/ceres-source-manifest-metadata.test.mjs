import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { measureSourceGlbMetadata, assertSourceManifestMetadata } from '../scripts/lib/ceresSourceMetadata.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../assets/ships/parts/parts_manifest.json',import.meta.url)));
const stale={place_ceres_second_measure:[7449728,127944],place_ceres_second_measure_long_plate:[733412,9024],
  place_ceres_second_measure_crossbeam:[828444,10508],place_ceres_second_measure_keel:[407228,3068]};
test('four Second Measure source rows derive all-LOD triangles and bytes from actual source GLBs',()=>{
  for(const [id,[oldBytes,oldTris]] of Object.entries(stale)){
    const row=manifest.parts.find(p=>p.id===id);assert.ok(row,id);
    const bytes=fs.readFileSync(new URL(`../assets/ships/parts/${row.file}`,import.meta.url));
    const measured=assertSourceManifestMetadata(row,bytes);
    assert.equal(measured.bytes,bytes.length);assert.ok(measured.tris>0);
    assert.throws(()=>assertSourceManifestMetadata({...row,bytes:oldBytes,tris:oldTris},bytes),/stale source manifest/,'Old stale count row must fail');
    assert.throws(()=>assertSourceManifestMetadata({...row,bytes:row.bytes+1},bytes),/stale source manifest/);
    assert.throws(()=>assertSourceManifestMetadata({...row,tris:row.tris+1},bytes),/stale source manifest/);
    assert.throws(()=>assertSourceManifestMetadata({...row,triangleMetric:'lod0'},bytes),/stale source manifest/);
  }
});
test('source metadata counter refuses malformed or truncated GLBs',()=>{
  assert.throws(()=>measureSourceGlbMetadata(Buffer.alloc(20)),/Invalid source GLB/);
  const row=manifest.parts.find(p=>p.id==='place_ceres_second_measure');
  const bytes=fs.readFileSync(new URL(`../assets/ships/parts/${row.file}`,import.meta.url));
  assert.throws(()=>measureSourceGlbMetadata(bytes.subarray(0,bytes.length-1)),/Invalid source GLB/);
});
