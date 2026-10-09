import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { worldSiteAssetBinding } from '../src/data/worldSiteAssetBindings.js';
import { CERES_SHIPBREAK_FILES } from '../src/render/ceresShipbreakVisuals.js';
import { verifyWorldSiteBindingProvenance } from '../scripts/lib/modelTruthWorldSite.mjs';
const staleSourceHashes={
  place_ceres_second_measure:'83fd27f3490af1d1f49961fc0276404ff1857959c18593a9d788dc5342312f09',
  place_ceres_second_measure_long_plate:'03930bb4528739a93aca7ad6f9ecf898a65e5bc8b3541a10df47381e19bd65b1',
  place_ceres_second_measure_crossbeam:'c5ae144b3a26f4d95235bc1c3ed6ee102d3e296185cca70fc2d77010825ed3b3',
  place_ceres_second_measure_keel:'b9339124a928d4ace117cc3b515a72abc9e7914763ec9a02ce509a83d7f6b08a',
};
test('every Second Measure socket binding proves actual source and release hashes and byte counts',()=>{
  for(const [id,file] of Object.entries(CERES_SHIPBREAK_FILES)){
    const row={id,file},binding=worldSiteAssetBinding(id);
    const source=fs.readFileSync(new URL(`../assets/ships/parts/${file}`,import.meta.url));
    const released=fs.readFileSync(new URL(`../assets/ships/release/parts/${file}`,import.meta.url));
    verifyWorldSiteBindingProvenance(binding,row,source,released);
    const stale=structuredClone(binding);stale.source.sha256=staleSourceHashes[id];
    assert.throws(()=>verifyWorldSiteBindingProvenance(stale,row,source,released),/stale or wrong/,'Old stale art binding must fail');
    for(const mutate of [b=>b.source.bytes++,b=>b.release.bytes++,b=>b.release.sha256='0'.repeat(64),b=>b.partId='wrong',b=>b.source.path='wrong']){
      const b=structuredClone(binding);mutate(b);assert.throws(()=>verifyWorldSiteBindingProvenance(b,row,source,released),/stale or wrong/);
    }
  }
});
