import test from 'node:test';
import assert from 'node:assert/strict';
import { runPhotoCapture, storePageScreenshotPath } from '../src/ui/screens/pause.js';

test('Photo Capture draws through its live owner and begins PNG readback in the same task', async () => {
  const previousReader = globalThis.FileReader;
  const order = [], downloads = [];
  globalThis.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,cGhvdG8='; this.onload(); }
  };
  try {
    let sameTask = false;
    const canvas = { toBlob(callback, mime) {
      assert.equal(sameTask, true, 'readback must start before the draw task yields');
      assert.equal(mime, 'image/png'); order.push('read');
      queueMicrotask(() => callback({}));
    } };
    const state = {render:{photoMode:{active:true},renderer:{domElement:canvas}}};
    const renderer = {state,renderer:state.render.renderer,drawPreparedFrame() {
      order.push('draw'); sameTask = true; queueMicrotask(() => {sameTask=false;}); return true;
    }};
    const ctx = {state,registry:{get:name=>name==='render'?renderer:null}};
    const host = {document:{createElement:()=>({click(){downloads.push(this.download);}})}};
    const result = await runPhotoCapture(ctx,host);
    assert.deepEqual(order,['draw','read']);
    assert.equal(result.ok,true);
    assert.equal(result.via,'download');
    assert.match(downloads[0],/^spaceface-store-.*\.png$/);
    assert.equal(state.render.storePage.path,storePageScreenshotPath());
    assert.equal(state.render.storePage.screenshot,'data:image/png;base64,cGhvdG8=');
  } finally { globalThis.FileReader = previousReader; }
});

test('Photo Capture refuses unavailable, foreign, or unsuccessful frame owners before reading', async () => {
  let reads=0,draws=0;
  const canvas={toDataURL(){reads++; return 'data:image/png;base64,eA==';}};
  const state={render:{photoMode:{active:true},renderer:{domElement:canvas}}};
  const render={state,renderer:state.render.renderer,drawPreparedFrame(){draws++;return false;}};
  const ctx={state,registry:{get:()=>render}};
  assert.equal((await runPhotoCapture(ctx,{})).ok,false);
  assert.equal(draws,1); assert.equal(reads,0);
  render.renderer={domElement:canvas};
  assert.equal((await runPhotoCapture(ctx,{})).ok,false);
  assert.equal(draws,1); assert.equal(reads,0);
  render.renderer=state.render.renderer; state.render.photoMode.active=false;
  assert.equal((await runPhotoCapture(ctx,{})).ok,false);
  assert.equal(draws,1); assert.equal(reads,0);
});
