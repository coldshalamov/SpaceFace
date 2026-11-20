import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoadingProgressDriver} from '../src/ui/loadingProgressDriver.js';
import { bootShellPacingActive, startupPictureRetired, whenStartupPictureRetired } from '../src/core/bootShellPacing.js';
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

test('deferred GPU work stays behind both startup pictures, including the title fade', async () => {
  const overlay = { style: { display: '' }, classList: { contains: () => false } };
  const cinematic = { hidden: false, style: {}, classList: new Set() };
  const elements = new Map([['boot-overlay', overlay], ['cinematic-splash', cinematic]]);
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: { getElementById: id => elements.get(id) }, configurable: true });
  let poll, cleared = false, settled = false;
  const host = { setInterval(callback) { poll = callback; return 1; }, clearInterval() { cleared = true; } };
  try {
    assert.equal(startupPictureRetired(), false);
    const ready = whenStartupPictureRetired({ host }).then(() => { settled = true; });
    overlay.style.display = 'none';
    poll();
    await Promise.resolve();
    assert.equal(settled, false, 'the title film still owns the picture after the loading shell retires');
    assert.equal(startupPictureRetired(), false);
    assert.equal(bootShellPacingActive(), true);

    cinematic.classList.add('is-closing');
    poll();
    await Promise.resolve();
    assert.equal(settled, false, 'the title fade still presents the film');

    elements.delete('cinematic-splash');
    assert.equal(startupPictureRetired(), true);
    assert.equal(bootShellPacingActive(), false);
    poll();
    await ready;
    assert.equal(cleared, true);
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});
