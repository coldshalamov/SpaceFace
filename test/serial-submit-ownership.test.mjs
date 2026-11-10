import assert from 'node:assert/strict';
import test from 'node:test';
import { makeGpuQueueSubmitter } from '../src/render/gpuQueuePace.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function owner({ parallel = false } = {}) {
  let lost = false;
  const gl = { getExtension: () => parallel ? {} : null, isContextLost: () => lost, finish() {} };
  const renderer = { getContext: () => gl, extensions: { get: () => parallel ? {} : null } };
  return { renderer, lose: () => { lost = true; } };
}

test('a renderer reservation includes asynchronous submission and its drain', async () => {
  const h = owner(), gate = deferred(), order = [];
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { order.push('drain'); } });
  const a = submit(async () => { order.push('a:start'); await gate.promise; order.push('a:submit'); });
  const b = submit(() => { order.push('b:submit'); });
  await Promise.resolve();
  assert.deepEqual(order, ['a:start']);
  gate.resolve(); await Promise.all([a, b]);
  assert.deepEqual(order, ['a:start', 'a:submit', 'drain', 'b:submit', 'drain']);
});

test('queued urgent units precede ordinary units without interrupting the active unit', async () => {
  const h = owner(), gate = deferred(), order = [];
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const active = submit(async () => { order.push('active'); await gate.promise; });
  const ordinary = submit(() => { order.push('ordinary'); });
  const urgent = submit(() => { order.push('urgent'); }, { urgent: true });
  gate.resolve(); await Promise.all([active, ordinary, urgent]);
  assert.deepEqual(order, ['active', 'urgent', 'ordinary']);
});

test('independent renderer contexts do not share a reservation', async () => {
  const a = owner(), b = owner(), gate = deferred();
  const submitA = makeGpuQueueSubmitter(a.renderer, { paceQueue: async () => {} });
  const submitB = makeGpuQueueSubmitter(b.renderer, { paceQueue: async () => {} });
  let aDone = false;
  const stuck = submitA(async () => { await gate.promise; aDone = true; });
  assert.equal(await submitB(() => 'b-ready'), 'b-ready');
  assert.equal(aDone, false);
  gate.resolve(); await stuck;
});

test('throwing submission drains its prefix, releases the queue and retains its exact error', async () => {
  const h = owner(), order = [], error = new Error('driver submission');
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { order.push('drain'); } });
  const failed = submit(() => { order.push('prefix'); throw error; });
  const next = submit(() => { order.push('next'); return 42; });
  await assert.rejects(failed, value => value === error);
  assert.equal(await next, 42);
  assert.deepEqual(order, ['prefix', 'drain', 'next', 'drain']);
});

test('a drain failure cannot replace a submission failure or wedge later units', async () => {
  const h = owner(), primary = new Error('primary'), secondary = new Error('drain');
  let drains = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => { if (++drains === 1) throw secondary; } });
  await assert.rejects(submit(() => { throw primary; }), error => error === primary);
  assert.equal(await submit(() => 'recovered'), 'recovered');
});

test('a queued owner is rechecked before its first submission', async () => {
  const h = owner(), gate = deferred(); let active = true, calls = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const held = submit(() => gate.promise);
  const retired = submit(() => { calls++; }, { isActive: () => active });
  active = false; gate.resolve(); await held;
  assert.deepEqual(await retired, { skipped: true, reason: 'owner-inactive' });
  assert.equal(calls, 0);
  assert.equal(await submit(() => 'next'), 'next');
});

test('context loss before queued submission skips GL work and releases ownership', async () => {
  const h = owner(), gate = deferred(); let calls = 0;
  const submit = makeGpuQueueSubmitter(h.renderer, { paceQueue: async () => {} });
  const held = submit(() => gate.promise);
  await Promise.resolve();
  const lost = submit(() => { calls++; });
  h.lose(); gate.resolve(); await held;
  assert.equal((await lost).contextLost, true);
  assert.equal(calls, 0);
});

test('KHR keeps its existing overlapping route without a serial reservation', () => {
  assert.equal(makeGpuQueueSubmitter(owner({ parallel: true }).renderer), null);
});

// Exercise the exact renderer-local seam against the real shared serial queue,
// without initializing WebGL or a game scene.
async function exactTouchFixture({parallel=false,touch=()=>{}}={}) {
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../src/render/renderer.js',import.meta.url),'utf8');
  const begin=source.indexOf('    const submitExactSubjectTouch = (');
  const end=source.indexOf('    const openingStampContext =',begin);
  assert.ok(begin>=0&&end>begin);
  // Exactly one callsite carries the pre-existing admitted-chain urgency; the
  // independent publish-touch callsites retain their original ordinary lane.
  assert.equal((source.match(/submitExactSubjectTouch\(subject, admissionOptions.isActive, urgent\)/g)||[]).length,1);
  assert.equal((source.match(/submitExactSubjectTouch\(subject, admissionOptions.isActive\)/g)||[]).length,2);
  const h=owner({parallel});let active=0,maxActive=0,restores=0;
  const submit=makeGpuQueueSubmitter(h.renderer,{paceQueue:async()=>{}});
  const instantiate=new Function('renderer','makeGpuQueuePacer','postTaskAtBackgroundPriorityBounded',
    'ownerInactiveTouchError','revealSubjectWithAncestors','touchExactTargetSubject',
    source.slice(begin,end)+'\nreturn submitExactSubjectTouch;');
  const invoke=instantiate(h.renderer,()=>submit?{submit}:null,()=>{},
    ()=>Object.assign(new Error('inactive'),{name:'AbortError'}),
    subject=>{assert.equal(subject.visible,false);subject.visible=true;active++;maxActive=Math.max(active,maxActive);
      return()=>{subject.visible=false;active--;restores++;};},touch);
  return {invoke,submit,counts:()=>({active,maxActive,restores})};
}

test('readable exact touches retain urgent FIFO behind active work and ahead of queued background work',async()=>{
 const order=[],gate=deferred();const f=await exactTouchFixture({touch:s=>order.push(s.name)});
 const active=f.submit(async()=>{order.push('active');await gate.promise;});
 const background=f.submit(()=>order.push('background'));
 const a={name:'urgent-a',visible:false},b={name:'urgent-b',visible:false};
 const pa=f.invoke(a,()=>true,true),pb=f.invoke(b,()=>true,true);
 await Promise.resolve();assert.deepEqual(order,['active']);assert.equal(a.visible,false);
 gate.resolve();await Promise.all([active,background,pa,pb]);
 assert.deepEqual(order,['active','urgent-a','urgent-b','background']);
 assert.deepEqual(f.counts(),{active:0,maxActive:1,restores:2});assert.equal(a.visible,false);assert.equal(b.visible,false);
});
test('ordinary exact touch remains behind queued background work',async()=>{
 const order=[],gate=deferred();const f=await exactTouchFixture({touch:()=>order.push('touch')});
 const active=f.submit(()=>gate.promise);const background=f.submit(()=>order.push('background'));
 const exact=f.invoke({visible:false},()=>true);gate.resolve();await Promise.all([active,background,exact]);
 assert.deepEqual(order,['background','touch']);
});
test('retired exact touch owner rejects without reveal and later background still runs',async()=>{
 const gate=deferred();let live=true,touched=0;const f=await exactTouchFixture({touch:()=>touched++});
 const active=f.submit(()=>gate.promise);const exact=f.invoke({visible:false},()=>live,true);
 const rejected=assert.rejects(exact,{name:'AbortError'});const background=f.submit(()=>42);
 live=false;gate.resolve();await active;await rejected;assert.equal(await background,42);
 assert.equal(touched,0);assert.deepEqual(f.counts(),{active:0,maxActive:0,restores:0});
});
test('throwing urgent exact draw restores visibility and retains its error',async()=>{
 const failure=new Error('exact draw');const f=await exactTouchFixture({touch:()=>{throw failure;}});
 const subject={visible:false};await assert.rejects(f.invoke(subject,()=>true,true),e=>e===failure);
 assert.equal(subject.visible,false);assert.equal(f.counts().restores,1);assert.equal(await f.submit(()=>42),42);
});
test('parallel exact touch keeps no-pacer route and owner guard',async()=>{
 let touched=0;const f=await exactTouchFixture({parallel:true,touch:()=>++touched});
 assert.equal(f.submit,null);const subject={visible:false};await f.invoke(subject,()=>true,true);
 await assert.rejects(f.invoke(subject,()=>false,true),{name:'AbortError'});
 assert.equal(touched,1);assert.equal(subject.visible,false);assert.equal(f.counts().restores,1);
});
