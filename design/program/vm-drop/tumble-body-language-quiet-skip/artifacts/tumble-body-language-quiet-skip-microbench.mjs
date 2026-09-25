/**
 * Probe: tumble body-language quiet path — shipPitchCandidates walk every tick
 * when no tumble/thrownTrail is active.
 * Before = walk N ships checking presentation.tumble every tick.
 * After  = latch after first all-quiet scan; skip until pitchPresentationEpoch bump.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ROOT = process.cwd();
const ITERS = 200000;
const RUNS = 11;
const N = 48;
function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
const N=${N}, ITERS=${ITERS};
function tumbleActive(tumble, thrown) {
  if (thrown && thrown.active) return true;
  if (!tumble) return false;
  return !!(tumble.active || tumble.intensity > 0.01 || tumble.mode === 'tumbling' || tumble.mode === 'drifting' || tumble.recovering);
}
function make() {
  const list = [];
  for (let i=0;i<N;i++) list.push({
    id:i, alive:true, pos:{x:i,z:0}, presentation:{ tumble:null, thrownTrail:null },
  });
  return { list, epoch:1, quiet:false, quietEpoch:-1, walks:0, skips:0, cd:new Map() };
}
function before(h) {
  h.walks++;
  for (const e of h.list) {
    if (!e || !e.alive || !e.pos) { h.cd.delete(e && e.id); continue; }
    if (!tumbleActive(e.presentation.tumble, e.presentation.thrownTrail)) {
      h.cd.delete(e.id); continue;
    }
    h.cd.set(e.id, 1);
  }
}
function after(h) {
  if (h.quiet && h.epoch === h.quietEpoch) { h.skips++; return; }
  h.walks++;
  let any=false;
  for (const e of h.list) {
    if (!e || !e.alive || !e.pos) { h.cd.delete(e && e.id); continue; }
    if (!tumbleActive(e.presentation.tumble, e.presentation.thrownTrail)) {
      h.cd.delete(e.id); continue;
    }
    any=true; h.cd.set(e.id, 1);
  }
  if (!any && h.cd.size===0) { h.quiet=true; h.quietEpoch=h.epoch; }
  else h.quiet=false;
}
const h=make();
const fn=${JSON.stringify(mode)}==='before'?before:after;
for (let i=0;i<2000;i++) fn(h);
h.walks=0; h.skips=0;
const t0=performance.now();
for (let i=0;i<ITERS;i++) fn(h);
console.log(JSON.stringify({ms:performance.now()-t0,mode:${JSON.stringify(mode)},walks:h.walks,skips:h.skips}));
`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:ROOT,encoding:'utf8'});
  if(r.status!==0) throw new Error(r.stderr||r.stdout);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
function median(xs){const a=[...xs].sort((x,y)=>x-y);return a[Math.floor(a.length/2)];}
const pairs=[];
for(let i=0;i<RUNS;i++){
  const b=runOnce('before'), a=runOnce('after');
  pairs.push({beforeMs:b.ms,afterMs:a.ms,speedup:b.ms/Math.max(1e-9,a.ms),beforeWalks:b.walks,afterWalks:a.walks,afterSkips:a.skips});
}
const s=pairs.map(p=>p.speedup);
const out={name:'tumble-body-language-quiet-skip',primary:'quiet-tumble-shipLike-walk-epoch-wake',iterations:ITERS,ships:N,runs:RUNS,pairs,medianSpeedup:+median(s).toFixed(3),minSpeedup:+Math.min(...s).toFixed(3),maxSpeedup:+Math.max(...s).toFixed(3)};
writeFileSync('artifacts/tumble-body-language-quiet-skip-microbench.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
