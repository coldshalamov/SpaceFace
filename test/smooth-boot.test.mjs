import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingProgressModel } from '../src/ui/loadingProgressModel.js';
import { createBootScheduler, yieldForBootPaint } from '../src/core/bootScheduler.js';
import { runBootInitializers } from '../src/core/bootSystemInit.js';
import { beginBootWork, observeBootWork, reportBootWork, createBootWorkAccumulator } from '../src/core/bootWork.js';
import { bootRingWorkerRuntime } from '../src/ui/orrery/bootRingWorker.js';
import vm from 'node:vm';

function advance(model, from, to, step = 1000 / 60) {
  let previous = model.snapshot().shown;
  for (let t = from; t <= to; t += step) {
    const value = model.tick(t);
    assert.ok(value >= previous, `rewound at ${t}`); assert.ok(value <= 1);
    previous = value;
  }
  return previous;
}
test('stalled stages creep for 10/30 seconds without claiming the next phase or 100%', () => {
  const m = createLoadingProgressModel();
  m.report({ id:'authored-library', progress:.30 },0,true);
  const a=advance(m,0,1000), b=advance(m,1000,10000);
  assert.ok(b>a+.01); assert.ok(b<.50);
  m.report({ id:'gpu-resources', progress:.90 },10000);
  const c=advance(m,10000,20000), d=advance(m,20000,40000);
  assert.ok(d>c); assert.ok(d<.94); assert.notEqual(m.format(),'100%');
});
test('repeat/late/invalid progress cannot reverse a session', () => {
  const m=createLoadingProgressModel();m.report({id:'authored-visuals',progress:.6},0,true);
  advance(m,0,8000);const before=m.snapshot().shown;
  m.report({id:'authored-library',progress:.3},8000);m.report({progress:NaN},8001);
  advance(m,8000,12000);assert.ok(m.snapshot().shown>=before);
});
test('repeated subwork retains the creep clock and accelerating reports remain monotonic', () => {
  const a=createLoadingProgressModel(),b=createLoadingProgressModel();
  a.report({id:'gpu-resources',progress:.9},0,true);b.report({id:'gpu-resources',progress:.9},0,true);
  for(let t=0;t<=30000;t+=50){a.tick(t);b.report({id:'gpu-resources',progress:.9},t);b.tick(t);}
  assert.ok(Math.abs(a.snapshot().shown-b.snapshot().shown)<1e-6);
});
test('100 is exclusive to finish, including an erroneous progress=1 event', () => {
  const m=createLoadingProgressModel();m.report({id:'entering-flight',progress:1},0,true);
  advance(m,0,100000);assert.ok(m.snapshot().shown<1);assert.notEqual(m.format(),'100%');
  m.finish();advance(m,100000,100500);assert.equal(m.format(),'100%');
});
test('new session resets both completed status and old target', () => {
  const m=createLoadingProgressModel();m.finish();advance(m,0,2000);assert.equal(m.snapshot().shown,1);
  m.report({id:'restoring-save',progress:.05},2000,true);
  assert.equal(m.snapshot().shown,0);assert.equal(m.snapshot().complete,false);
  advance(m,2000,3000);assert.ok(m.snapshot().shown<.08);
});
test('reduced motion reports real progress without speculative creep', () => {
  const m=createLoadingProgressModel();m.setReduced(true);
  m.report({id:'authored-library',progress:.25},0,true);
  advance(m,0,30000);assert.equal(m.snapshot().shown,.25);
  m.finish();m.tick(30001);assert.equal(m.snapshot().shown,1);
});
test('variable frame cadence and a long background interval stay bounded', () => {
  for(const hz of [30,60,144]){
    const m=createLoadingProgressModel();m.report({id:'authored-visuals',progress:.5},0,true);
    advance(m,0,5000,1000/hz);const before=m.snapshot().shown;
    m.tick(24*60*60*1000);assert.ok(m.snapshot().shown-before<=.21);
    m.tick(0);assert.ok(m.snapshot().shown>=before);
  }
});
test('cooperative budget batches tiny hooks; long hooks cause an immediate checkpoint', async () => {
  let time=0,yields=0;const scheduler=createBootScheduler({budgetMs:4,now:()=>time,yieldToMain:()=>{yields++;}});
  for(let i=0;i<3;i++){scheduler.measure('tiny',()=>time++);assert.equal(scheduler.checkpoint(),null);}
  scheduler.measure('fourth',()=>time++);await scheduler.checkpoint();assert.equal(yields,1);
  scheduler.measure('long',()=>time+=23);await scheduler.checkpoint();
  assert.equal(scheduler.snapshot().longestTaskMs,23);assert.equal(scheduler.snapshot().tasks,5);
});
test('ordered async initialization preserves context, order and before-call rollback ownership',async()=>{
  const ctx={},calls=[],attempted=[];let time=0;let yields=0;
  const systems=[{name:'a',init(c){assert.equal(c,ctx);calls.push('a');time+=5;}},
    {name:'no-hook'}, {name:'b',init(){calls.push('b');time+=5;}}];
  const metrics=await runBootInitializers(systems,ctx,{now:()=>time,yieldToMain:()=>{yields++;}},attempted);
  assert.deepEqual(calls,['a','b']);assert.deepEqual(attempted,[systems[0],systems[2]]);
  assert.equal(metrics.tasks,2);assert.equal(yields,3);
});
test('initialization fails with the throwing system in attempted, never runs later hooks', async()=>{
  const attempted=[],sentinel=new Error('init failed');let later=false;
  const systems=[{name:'first',init(){}},{name:'bad',init(){throw sentinel;}},{name:'later',init(){later=true;}}];
  await assert.rejects(runBootInitializers(systems,{}, {yieldToMain:()=>{}},attempted),error=>error===sentinel);
  assert.equal(attempted.length,2);assert.equal(later,false);
});
test('progress observer failures do not affect successful initialization', async()=>{
  let calls=0;await runBootInitializers([{init(){calls++;}}],{}, {yieldToMain:()=>{},onProgress(){throw Error('UI');}});
  assert.equal(calls,1);
});
test('init hook returned promises are not repurposed as dependency barriers', async()=>{
  let second=false;const never=new Promise(()=>{});
  await runBootInitializers([{init(){return never;}},{init(){second=true;}}],{}, {yieldToMain:()=>{}});
  assert.equal(second,true);
});
test('yield occurs after rAF callback, not in its promise microtask, and cancels losers',async()=>{
  const tasks=new Map(),frames=new Map();let serial=0,done=false;
  const host={document:{hidden:false},setTimeout(fn){tasks.set(++serial,fn);return serial;},
    clearTimeout(id){tasks.delete(id);},requestAnimationFrame(fn){frames.set(++serial,fn);return serial;},
    cancelAnimationFrame(id){frames.delete(id);}};
  const wait=yieldForBootPaint({host}).then(()=>done=true);
  const [frameId,frame]=[...frames][0];frames.delete(frameId);frame();await Promise.resolve();assert.equal(done,false);
  const task=[...tasks.values()].at(-1);task();await wait;assert.equal(done,true);assert.equal(tasks.size,0);
});
test('hidden-tab yield uses a bounded task without waiting on rAF',async()=>{
  let raf=0;
  await yieldForBootPaint({host:{document:{hidden:true},setTimeout,clearTimeout,requestAnimationFrame(){raf++;}}});
  assert.equal(raf,0);
});
test('real work receipts advance only successful units and observer teardown is clean',()=>{
  const receipts=[],owner={};const off=observeBootWork(r=>receipts.push(r));
  const bad=observeBootWork(()=>{throw Error('bad observer');});
  const work=beginBootWork(owner,'textures',4);work.update(1);work.update(2,false);work.update(4);
  assert.equal(receipts[2].completed,1);assert.equal(receipts[2].status,'failed');
  assert.equal(receipts.at(-1).completed,4);assert.equal(receipts.at(-1).owner,owner);
  off();bad();reportBootWork(owner,{status:'complete'});assert.equal(receipts.length,4);
});
test('dynamic totals cannot rewind stage fraction or exhaust late-work reserve',()=>{
  const acc=createBootWorkAccumulator({id:'gpu-resources',progress:.9});
  const a=acc.accept({key:1,total:10,completed:10});const b=acc.accept({key:2,total:100,completed:0});
  assert.ok(a.progress<.94);assert.equal(a.progress,b.progress);
  assert.equal(acc.accept({kind:'cook-step',step:'lane',outcome:'sample'}),null);
  assert.equal(acc.accept({kind:'cook-step',step:'failed',outcome:'timeout'}),null);
});
test('worker runtime serializes without closure dependencies, pauses and tags reset epochs',()=>{
  const posted=[],timers=new Map();let serial=0,time=0;
  const ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];return ()=>{};},set(t,k,v){t[k]=v;return true;}});
  const sandbox={performance:{now:()=>time,timeOrigin:1000},postMessage:m=>posted.push(m),
    setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),close(){},onmessage:null};
  vm.createContext(sandbox);vm.runInContext(`(${bootRingWorkerRuntime.toString()})(${createLoadingProgressModel.toString()});`,sandbox);
  const send=data=>sandbox.onmessage({data});
  send({type:'init',canvas:{getContext:()=>ctx},stage:{id:'gpu-resources',progress:.9}});
  assert.ok(posted.some(p=>p.type==='ready'));assert.equal(timers.size,1);
  send({type:'pause'});assert.equal(timers.size,0);
  time=1000;send({type:'stage',reset:true,epoch:3,stage:{id:'preparing-run',progress:.08}});
  assert.equal(posted.filter(p=>p.type==='sample').at(-1).epoch,3);
  send({type:'destroy'});assert.equal(timers.size,0);
});
