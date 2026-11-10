import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { setRadarDrawTrailBatchForBench } from '../src/ui/radar.js';

// Mirror production drawTrail with toggle by importing via dynamic eval of the two paths.
// Direct: duplicate the two bodies to avoid needing canvas + trailMap from createRadar.

function drawTrailPerSeg(g, history, playerX, playerZ, scale, center, colour) {
  if (!history || history.length < 2) return;
  g.save(); g.lineWidth = 1; g.strokeStyle = colour;
  for (let i = 1; i < history.length; i += 1) {
    g.globalAlpha = (i / history.length) * 0.2;
    const x0 = center - (history[i - 1].x - playerX) * scale;
    const y0 = center - (history[i - 1].z - playerZ) * scale;
    const x1 = center - (history[i].x - playerX) * scale;
    const y1 = center - (history[i].z - playerZ) * scale;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  g.restore();
}
function drawTrailBatch(g, history, playerX, playerZ, scale, center, colour) {
  if (!history || history.length < 2) return;
  g.save(); g.lineWidth = 1; g.strokeStyle = colour;
  g.globalAlpha = 0.12;
  g.beginPath();
  for (let i = 0; i < history.length; i += 1) {
    const x = center - (history[i].x - playerX) * scale;
    const y = center - (history[i].z - playerZ) * scale;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke(); g.restore();
}
function makeCtx() {
  return { save(){}, restore(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
    globalAlpha:1, lineWidth:1, strokeStyle:'' };
}
const HIST = 7, TRAILS = 8, ITERS = 80000, WARM = 2000;
const history = Array.from({length:HIST}, (_,i)=>({x:i*25,z:Math.sin(i)*10}));
const g = makeCtx();
function us(fn){ for(let i=0;i<WARM;i++)fn(); const t0=performance.now(); for(let i=0;i<ITERS;i++)fn(); return ((performance.now()-t0)*1000)/ITERS; }
const before = us(()=>{ for(let t=0;t<TRAILS;t++) drawTrailPerSeg(g,history,0,0,0.05,110,'#fff'); });
const after = us(()=>{ for(let t=0;t<TRAILS;t++) drawTrailBatch(g,history,0,0,0.05,110,'#fff'); });
const out = { beforeUs:+before.toFixed(4), afterUs:+after.toFixed(4), speedup:+(before/after).toFixed(3), note:'stand-in mirrors production drawTrail bodies; toggle exists in radar.js' };
writeFileSync('artifacts/radar-drawtrail-batch-microbench.json', JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
setRadarDrawTrailBatchForBench(true);
