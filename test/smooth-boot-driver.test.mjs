import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingProgressDriver} from '../src/ui/loadingProgressDriver.js';
test('minimal shell preserves the original bar hook, first step and eased transitions',()=>{
  let queue=[],time=0,width=0;
  const host={requestAnimationFrame(fn){queue.push(fn);return queue.length;},cancelAnimationFrame(){queue=[];}};
  const driver=createLoadingProgressDriver(host);driver.subscribe(f=>width=f*100);
  const pump=frames=>{const seen=[];for(let i=0;i<frames;i++){const q=queue;queue=[];time+=16.7;for(const f of q)f(time);seen.push(width);}return seen;};
  driver.report({id:'preparing-run',progress:.08},{reset:true});driver.start();assert.equal(width,8);
  driver.report({id:'authored-library',progress:.25});const ramp=pump(4);assert.ok(ramp[0]<12);
  const settled=pump(60).at(-1);assert.ok(settled>20&&settled<30);
  const creep=pump(180).at(-1);assert.ok(creep>settled&&creep<=31.5,`${creep}`);
  driver.destroy();assert.equal(queue.length,0);
});
test('no animation clock publishes the verified step synchronously',()=>{
  const driver=createLoadingProgressDriver({});let width=0;
  driver.subscribe(f=>width=f*100);driver.report({id:'authored-visuals',progress:.5},{reset:true});assert.equal(width,50);
});
