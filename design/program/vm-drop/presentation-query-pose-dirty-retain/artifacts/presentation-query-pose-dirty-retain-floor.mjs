/** Isolated child-process floor capture for pose-dirty retain. */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const childSrc = `
import { performance } from 'node:perf_hooks';
import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
  setPresentationQueryRetainPosQuantizeForBench,
  setPresentationQueryPoseDirtyRetainForBench,
} from '../src/render/presentationQueries.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
const ITERS=12000, ENTS=180, RUNS=11;
function med(a){const s=[...a].sort((x,y)=>x-y);return s[(s.length-1)>>1];}
function entity(id,x,z,r=8){return{id,type:'asteroid',alive:true,pos:{x,y:0,z},prevPos:{x,y:0,z},rot:0,prevRot:0,bank:0,prevBank:0,pitch:0,prevPitch:0,radius:r,flags:{},presentationVisualRevision:0};}
function bind(w,v){w.bindMesh(w.handleForEntityId(v.id),{userData:{},position:{x:v.pos.x,y:0,z:v.pos.z}},v,v.radius);}
function clear(w){const a=w.getDiagnostics().active;for(let i=0;i<a;i++)w.clearDirty(w.activeSlots[i]);}
function boot(){
  const world=createPresentationWorld({capacity:256,cellSize:64});
  const ents=[];
  for(let i=0;i<ENTS;i++){const ang=(i/ENTS)*Math.PI*2;const e=entity(100+i,Math.cos(ang)*90,Math.sin(ang)*90);world.allocateEntity(e,1);bind(world,e);ents.push(e);}
  const player=entity(1,0,0,6);player.type='ship';world.allocateEntity(player,1);bind(world,player);
  return {world,player,ents};
}
function time(on){
  setPresentationQueryZeroDirtyRetainForBench(true);
  setPresentationQueryRetainPosQuantizeForBench(true);
  setPresentationQueryPoseDirtyRetainForBench(on);
  const {world,player,ents}=boot();
  const q=createPresentationQueries(world);
  const opt={bounds:{x:0,z:0,halfX:220,halfZ:140},origin:{x:0,z:0},playerId:1};
  clear(world);q.query(opt);
  const t0=performance.now();
  for(let i=0;i<ITERS;i++){
    player.rot+=0.02;world.refreshVisibleEntity(world.getSlotForEntityId(1),player,6);
    const npc=ents[i%ents.length];npc.pos.x+=(i%2?0.002:-0.002);
    world.refreshVisibleEntity(world.getSlotForEntityId(npc.id),npc,npc.radius);
    q.query(opt);clear(world);
  }
  return performance.now()-t0;
}
const pairs=[];
for(let r=0;r<RUNS;r++) pairs.push(time(false)/Math.max(1e-9,time(true)));
console.log(JSON.stringify({medianSpeedup:+med(pairs).toFixed(3),minSpeedup:+Math.min(...pairs).toFixed(3),maxSpeedup:+Math.max(...pairs).toFixed(3),pairs:pairs.map(x=>+x.toFixed(3))}));
`;
writeFileSync(join(__dirname, 'presentation-query-pose-dirty-retain-floor-child.mjs'), childSrc);

const runs = [];
for (let i = 0; i < 5; i++) {
  const r = spawnSync(process.execPath, [join(__dirname, 'presentation-query-pose-dirty-retain-floor-child.mjs')], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
    timeout: 120000,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  const line = r.stdout.trim().split('\n').filter(Boolean).pop();
  const j = JSON.parse(line);
  runs.push(j);
  console.log('run', i + 1, j);
}
const mins = runs.map((r) => r.minSpeedup);
const meds = runs.map((r) => r.medianSpeedup);
const summary = {
  runs,
  packageFloorMin: Math.min(...mins),
  packageMedianBand: meds,
};
writeFileSync(join(__dirname, 'presentation-query-pose-dirty-retain-floor-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
