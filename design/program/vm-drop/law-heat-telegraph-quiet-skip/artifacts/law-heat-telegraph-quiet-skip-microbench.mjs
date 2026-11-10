/**
 * Proxy: quiet law-heat telegraph residual.
 * Before = a11y resolve + update + stamp() alloc + 2× light-pool find/release every idle tick.
 * After  = latch when live===0 and no sustained law lights; wake on acceptScan/acceptHeat seq.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const LIGHT_POOL = 6;
function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const ITERS=${ITERS};
const LIGHT_POOL=${LIGHT_POOL};
function resolveA11y(settings){
  const video=settings&&settings.video||{};
  const accessibility=settings&&settings.accessibility||{};
  const motion=!!video.motionReduce;
  const flash=!!(video.flashReduce||accessibility.flashReduce);
  if(motion&&flash) return {id:'both',flashOpacityScale:0.3,eventLightPeakScale:0};
  if(motion) return {id:'motion',flashOpacityScale:1,eventLightPeakScale:0};
  if(flash) return {id:'flash',flashOpacityScale:0.3,eventLightPeakScale:0.55};
  return {id:'full',flashOpacityScale:1,eventLightPeakScale:1};
}
function makeStamp(){return {scanSweep:null,suspicion:null,wantedFlip:null};}
function updateCtrl(stamp,dt,heatValue){
  let live=0;
  if(stamp.scanSweep&&stamp.scanSweep.active){
    stamp.scanSweep.age=(stamp.scanSweep.age||0)+dt;
    if(stamp.scanSweep.age>=stamp.scanSweep.life) stamp.scanSweep=null; else live++;
  }
  if(stamp.suspicion&&stamp.suspicion.active){
    if(heatValue!=null && heatValue<=0) stamp.suspicion=null; else live++;
  }
  if(stamp.wantedFlip&&stamp.wantedFlip.active){
    stamp.wantedFlip.age=(stamp.wantedFlip.age||0)+dt;
    if(stamp.wantedFlip.age>=stamp.wantedFlip.life) stamp.wantedFlip=null; else live++;
  }
  return live;
}
function stampSnap(stamp){
  return {
    scanSweep: stamp.scanSweep ? {...stamp.scanSweep} : null,
    suspicion: stamp.suspicion ? {...stamp.suspicion} : null,
    wantedFlip: stamp.wantedFlip ? {...stamp.wantedFlip} : null,
  };
}
function findSustained(pool,key){
  for(let i=0;i<pool.length;i++){
    const s=pool[i];
    if(s.active&&s.sustainedKey===key) return s;
  }
  return null;
}
function release(pool,key){
  const slot=findSustained(pool,key);
  if(!slot||!slot.active) return false;
  slot.active=false; slot.sustainedKey=null; return true;
}
function applyLights(pool,stamp){
  const snap=stampSnap(stamp);
  if(snap.scanSweep&&snap.scanSweep.active){ /* upsert path not modeled */ }
  else release(pool,'scan');
  if(snap.suspicion&&snap.suspicion.active){ /* upsert */ }
  else release(pool,'suspicion');
  if(!(snap.wantedFlip&&snap.wantedFlip.active)) release(pool,'wanted-flip');
}
function maybeAwake(h){ return h.wakeSeq !== h.latchedSeq; }
function make(){
  const pool=[];
  for(let i=0;i<LIGHT_POOL;i++) pool.push({active:false,sustainedKey:null,slot:i});
  return {
    quiet:false,walks:0,skips:0,wakeSeq:0,latchedSeq:0,
    stamp:makeStamp(), pool,
    settings:{video:{},accessibility:{}},
    heat:0,
  };
}
function before(h,dt){
  h.walks++;
  const a11y=resolveA11y(h.settings);
  const live=updateCtrl(h.stamp,dt,h.heat);
  applyLights(h.pool,h.stamp);
  void a11y; void live;
}
function after(h,dt){
  if(h.quiet && !maybeAwake(h)){ h.skips++; return; }
  if(h.quiet) h.quiet=false;
  h.walks++;
  const a11y=resolveA11y(h.settings);
  const live=updateCtrl(h.stamp,dt,h.heat);
  applyLights(h.pool,h.stamp);
  if(live===0 && !maybeAwake(h)){
    h.quiet=true;
    h.latchedSeq=h.wakeSeq;
  }
  void a11y;
}
const mode=${JSON.stringify(mode)};
const h=make();
const dt=1/60;
after(h,dt);
if(mode==='after'&&!h.quiet) throw new Error('failed to latch');
const fn=mode==='before'?before:after;
const t0=performance.now();
for(let i=0;i<ITERS;i++) fn(h,dt);
console.log(JSON.stringify({mode,ms:performance.now()-t0,walks:h.walks,skips:h.skips,quiet:h.quiet}));
`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:ROOT,encoding:'utf8'});
  if(r.status!==0) throw new Error(r.stderr||r.stdout);
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}
function wakeProof(){
  const script=`
let quiet=true, wakeSeq=0, latchedSeq=0;
const maybe=()=>wakeSeq!==latchedSeq;
let held = quiet && !maybe();
wakeSeq++;
let woke=false;
if(quiet && !maybe()){} else { quiet=false; woke=true; }
console.log(JSON.stringify({ok:held&&woke&&quiet===false}));
`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:ROOT,encoding:'utf8'});
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}
const pairs=[];
for(let i=0;i<RUNS;i++){
  const b=runOnce('before'),a=runOnce('after');
  pairs.push({beforeMs:b.ms,afterMs:a.ms,speedup:b.ms/a.ms,afterSkips:a.skips});
}
const s=pairs.map(p=>p.speedup).sort((a,b)=>a-b);
const median=s[Math.floor(s.length/2)];
const minSpeedup=s[0];
const wake=wakeProof();
const out={
  name:'law-heat-telegraph-quiet-skip',
  primary:'quiet-law-heat-telegraph-idle-latch',
  iterations:ITERS,
  runs:RUNS,
  lightPool:LIGHT_POOL,
  pairs,
  median,
  minSpeedup,
  dirtyWake:wake,
};
writeFileSync('artifacts/law-heat-telegraph-quiet-skip-microbench.json', JSON.stringify(out,null,2));
console.log(JSON.stringify({median,minSpeedup,max:s[s.length-1],dirtyWake:wake},null,2));
