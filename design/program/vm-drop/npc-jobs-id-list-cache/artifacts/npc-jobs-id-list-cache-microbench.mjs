function makeById(n){ const o=Object.create(null); for(let i=0;i<n;i++) o['j'+i]={entityId:i,job:{phase:'haul'},control:null,threatId:null}; return o; }
const N=120, TICKS=10000;
const byId=makeById(N);
const idList=Object.keys(byId);
const entities=new Map(); for(let i=0;i<N;i++) entities.set(i,{id:i,alive:true,pos:{x:i,z:0}});
function work(ids){
  let n=0;
  for(let i=0;i<ids.length;i++){
    const e=byId[ids[i]]; if(!e||!e.job||e.entityId==null) continue;
    const ent=entities.get(e.entityId); if(!ent||!ent.alive||!ent.pos) continue;
    if(e.control||e.job.corrupt||e.job.phase==='COMPLETE') continue;
    n += ent.pos.x;
  }
  return n;
}
let sink=0;
let t0=performance.now();
for(let t=0;t<TICKS;t++){ const ids=Object.keys(byId); sink+=work(ids); }
const beforeMs=performance.now()-t0;
t0=performance.now();
for(let t=0;t<TICKS;t++){ sink+=work(idList); }
const afterMs=performance.now()-t0;
console.log(JSON.stringify({beforeMs,afterMs,speedup:beforeMs/afterMs,ticks:TICKS,jobs:N,sink},null,2));
