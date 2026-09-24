/**
 * Probe: quiet _emitTrails idle shipLike walk — every emit tick still pays
 * _engineDriveFor-like work per candidate even when all drives < idle band.
 * Before = walk N ships computing drive every emit tick.
 * After  = latch after first all-idle walk; skip until cheap maybe-awake.
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
function engineDriveFor(e, out) {
  const vx = e.vel.x, vz = e.vel.z;
  const speed = Math.hypot(vx, vz);
  const maxSpeed = Math.max(1, e.maxSpeed || 120);
  const frame = e._flightFrame || {};
  let throttle = Number.isFinite(frame.throttle) ? Math.max(0, Math.min(1.15, frame.throttle)) : 0;
  const actuators = e.actuators || null;
  const reverse = actuators ? Math.max(0, actuators.reverse || 0) : 0;
  const main = actuators ? (actuators.main || 0) : 0;
  if (main > 0.001) throttle = main;
  const cf = Math.cos(e.rot || 0), sf = Math.sin(e.rot || 0);
  const forwardSpeed = vx * cf + vz * sf;
  let forwardDrive = Math.min(1.1, Math.max(0, forwardSpeed) / Math.max(35, maxSpeed * 0.75));
  let speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
  const boost = e.flags && e.flags.boosting ? 1 : 0;
  let drive = Math.min(1.35, Math.max(throttle, forwardDrive * 0.85, speedDrive * 0.40) + boost * 0.45);
  out.drive = drive; out.speedDrive = speedDrive; out.boost = boost;
  return out;
}
function maybeAwake(list) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e || !e.alive) continue;
    if (e.flags && e.flags.docked) continue;
    if (e.flags && e.flags.boosting) return true;
    const frame = e._flightFrame || {};
    if ((Number.isFinite(frame.throttle) && frame.throttle > 0.03)
      || (Number.isFinite(frame.commandedThrottle) && frame.commandedThrottle > 0.03)) return true;
    const a = e.actuators;
    if (a && (Math.abs(a.lateral||0)>0.001 || Math.abs(a.yaw||0)>0.001 || (a.reverse||0)>0.001 || (a.main||0)>0.03)) return true;
    const vx = e.vel.x, vz = e.vel.z;
    if (vx !== 0 || vz !== 0) {
      const speed = Math.hypot(vx, vz);
      const maxSpeed = Math.max(1, e.maxSpeed || 120);
      const speedDrive = Math.min(1, speed / Math.max(40, maxSpeed * 0.75));
      if (speedDrive * 0.40 > 0.03) return true;
    }
  }
  return false;
}
function make() {
  const list = [];
  for (let i=0;i<N;i++) list.push({
    id:i, alive:true, type:'ship', rot:0.1*i, maxSpeed:120,
    vel:{x:0,z:0}, flags:{docked:false,boosting:false},
    _flightFrame:{throttle:0,commandedThrottle:0}, actuators:{main:0,reverse:0,lateral:0,yaw:0},
    hull:100, hullMax:100,
  });
  return { list, quiet:false, walks:0, skips:0, scratch:{drive:0,speedDrive:0,boost:0}, emitted:0 };
}
function before(h) {
  h.walks++;
  for (const e of h.list) {
    if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
    if (e.flags && e.flags.docked) continue;
    const d = engineDriveFor(e, h.scratch);
    if (d.drive < 0.055) continue;
    h.emitted++;
  }
}
function after(h) {
  if (h.quiet && !maybeAwake(h.list)) { h.skips++; return; }
  h.walks++;
  let any=false;
  for (const e of h.list) {
    if (!e.alive || (e.type !== 'ship' && e.type !== 'drone')) continue;
    if (e.flags && e.flags.docked) continue;
    const d = engineDriveFor(e, h.scratch);
    if (d.drive < 0.055) continue;
    any=true; h.emitted++;
  }
  h.quiet = !any;
}
const h=make();
const fn=${JSON.stringify(mode)}==='before'?before:after;
for (let i=0;i<2000;i++) fn(h);
h.walks=0; h.skips=0; h.emitted=0;
const t0=performance.now();
for (let i=0;i<ITERS;i++) fn(h);
console.log(JSON.stringify({ms:performance.now()-t0,mode:${JSON.stringify(mode)},walks:h.walks,skips:h.skips,emitted:h.emitted}));
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
const out={name:'trail-emit-idle-drive-walk',primary:'quiet-trail-emit-idle-drive-latch',iterations:ITERS,ships:N,runs:RUNS,pairs,medianSpeedup:+median(s).toFixed(3),minSpeedup:+Math.min(...s).toFixed(3),maxSpeedup:+Math.max(...s).toFixed(3)};
writeFileSync('artifacts/trail-emit-idle-drive-walk-microbench.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({medianSpeedup:out.medianSpeedup,minSpeedup:out.minSpeedup,maxSpeedup:out.maxSpeedup,pairs:pairs.map(p=>+p.speedup.toFixed(3))},null,2));
