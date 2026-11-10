import fs from 'node:fs';
const rows=[];
for (const f of process.argv.slice(2)) { const l=fs.readFileSync(f,'utf8').split('\n').find(x=>x.includes('BENCH164')); if(!l) continue; const b=JSON.parse(l.slice(l.indexOf('{'))); rows.push(b); }
const med=x=>{const y=x.slice().sort((a,b)=>a-b);return y[Math.floor(y.length/2)];};
for (const [i,b] of rows.entries()) {
  const ratios=b.hull.off.map((o,j)=>o/b.hull.on[j]);
  console.log(`run${i+1} hull quiet med off ${b.hullQuietMedOffUs.toFixed(2)} on ${b.hullQuietMedOnUs.toFixed(3)} x${(b.hullQuietMedOffUs/b.hullQuietMedOnUs).toFixed(1)} floor x${Math.min(...ratios).toFixed(1)} | perFrame off ${b.hull.perFrameOffUs?.toFixed(1)} on ${b.hull.perFrameOnUs?.toFixed(1)} | live change on ${b.hullLiveMedOnUs.toFixed(2)} off ${b.hullLiveMedOffUs.toFixed(2)} (x${(b.hullLiveMedOffUs/b.hullLiveMedOnUs).toFixed(2)}) | liveChanged ${b.hull.liveInputChangedFrames}/${b.hull.liveFramesObserved} key ${b.hull.liveKey} | mem tight ${b.memMedBeforeUs.toFixed(2)}->${b.memMedAfterUs.toFixed(3)} perFrame ${b.mem.perFrameBeforeUs.toFixed(1)}`);
}
