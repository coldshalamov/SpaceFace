import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createSignalTableaux} from '../src/ui/loadingSignalTableaux.js';
import {createIntro2DEngine,createIntroGLEngine,INTRO_GL_SOURCES} from '../src/ui/loadingTerminalArt.js';
const art=()=>createSignalTableaux({});
const maxDelta=(a,b)=>a.reduce((m,x,i)=>Math.max(m,Math.abs(x-b[i])),0);
const pose=(a,t,act=-1,reduced=false)=>new Float32Array(a.sample(t,act,reduced).positions);
const noop=()=>{};
function canvasHost(){const context=new Proxy({},{get:(o,k)=>o[k]??noop,set:(o,k,v)=>(o[k]=v,true)});return {document:{createElement:()=>({width:0,height:0,getContext:()=>context})},context};}

test('five coherent authored sculptures have real surface geometry',()=>{
 const a=art(),rows=a.inspect();assert.equal(rows.length,5);
 assert.deepEqual(rows.map(x=>x.id),['witness','courier','anchorage','massline','singularity']);
 for(const r of rows){assert(r.finite&&r.continuous);assert(r.points>500);assert(r.faces>0);}
 assert(rows[1].faces>100);assert(rows[2].faces>500);assert(a.continuous);a.dispose();
});
test('source is standalone and survives worker-style function serialization',()=>{
 const a=runInNewContext(`(${createSignalTableaux.toString()})({})`);
 assert.equal(a.sample(1.5).bodies.length,6);assert.equal(a.stats().pointCount,art().stats().pointCount);
 const s=createSignalTableaux.toString();assert(!/Math\.random\(|requestAnimationFrame\(|setInterval\(|fetch\(/.test(s));a.dispose();
});
test('legacy act controls cannot select or freeze a scene',()=>{
 const a=art(),p=pose(a,14.5);for(const act of [-1,0,1,2,3,4,99])assert.equal(maxDelta(p,pose(a,14.5,act)),0);a.dispose();
});
test('all five objects move at every sampled interval across two minutes',()=>{
 const a=art(),mins=Array(5).fill(Infinity);let samples=0;
 for(let t=0;t<=120;t+=.125){
  const f=a.sample(t),before=new Float32Array(f.positions),alpha=new Float32Array(f.alphas);
  for(const x of before)assert(Number.isFinite(x));
  const g=a.sample(t+1/30),sum=Array(5).fill(0),count=Array(5).fill(0);
  for(let k=0;k<g.tracks.length;k++){
   const p=g.tracks[k];if(p.object>=5||alpha[k]<.04)continue;
   for(let j=0;j<p.count;j+=Math.max(1,Math.floor(p.count/8))){const i=p.offset+j*2;sum[p.object]+=Math.hypot(g.positions[i]-before[i],g.positions[i+1]-before[i+1]);count[p.object]++;}
  }
  for(let o=0;o<5;o++){assert(count[o]>0);const d=sum[o]/count[o];mins[o]=Math.min(mins[o],d);assert(d>.002,`held object ${o} at ${t}: ${d}`);}
  samples++;
 }
 console.log('Motion sweep:',JSON.stringify({samples,seconds:120,minimumMeanDisplacementPer30HzStep:mins}));a.dispose();
});
test('former 6.5-second boundaries and 32.5-second wrap are continuous',()=>{
 const a=art();for(let t=6.5;t<125;t+=6.5){assert(maxDelta(pose(a,t-.0001),pose(a,t+.0001))<.2,`jump at ${t}`);}
 assert(maxDelta(pose(a,0),pose(a,32.5))>100);a.dispose();
});
test('composition is not a fixed centered montage; depth and scale change independently',()=>{
 const a=art(),ranges=Array.from({length:5},()=>({xs:[],ys:[],ds:[],ss:[]}));
 for(let t=0;t<120;t+=.5){const bs=a.sample(t).bodies.slice(0,5);assert(bs.filter(b=>Math.hypot(b.x,b.y)<80).length<3);
  bs.forEach((b,i)=>{ranges[i].xs.push(b.x);ranges[i].ys.push(b.y);ranges[i].ds.push(b.depth);ranges[i].ss.push(b.scale);});
 }
 for(const r of ranges){assert(Math.max(...r.xs)-Math.min(...r.xs)>400);assert(Math.max(...r.ys)-Math.min(...r.ys)>200);assert(Math.max(...r.ds)-Math.min(...r.ds)>.6);assert(Math.max(...r.ss)-Math.min(...r.ss)>.3);}a.dispose();
});
test('station ring, orbiting craft, and visor move relative to their parent',()=>{
 const a=art();for(const [o,g] of [[0,1],[2,1],[3,2]]){
  const f=a.sample(10),p=f.tracks.find(p=>p.object===o&&p.group===g),b={...f.bodies[o]},x=f.positions[p.offset]-b.x,y=f.positions[p.offset+1]-b.y;
  const h=a.sample(12),c=h.bodies[o];assert(Math.hypot((h.positions[p.offset]-c.x)-x,(h.positions[p.offset+1]-c.y)-y)>.3);
 }a.dispose();
});
test('reduced motion is an explicitly stable pose, independent of time and flow',()=>{
 const a=art(),p=pose(a,0,0,true);a.setFlow(1.2,.08,-.03,.008,.01,1,2);assert.equal(maxDelta(p,pose(a,900,4,true)),0);assert.equal(a.sample(4,2,true).time,12);a.dispose();
});
test('sampling has stable typed storage and deterministic repeatable output',()=>{
 const a=art(),f=a.sample(1),positions=f.positions,tracks=f.tracks,order=f.order,p=pose(a,12.34);
 a.sample(300);assert.strictEqual(a.sample(4),f);assert.strictEqual(f.positions,positions);assert.strictEqual(f.tracks,tracks);assert.strictEqual(f.order,order);
 assert.equal(maxDelta(p,pose(a,12.34)),0);assert.equal(maxDelta(p,pose(art(),12.34)),0);a.dispose();
});
test('invalid clocks are safe and very large clocks remain finite',()=>{
 const a=art();for(const t of [NaN,Infinity,-Infinity,-12,Number.MAX_VALUE])for(const p of a.sample(t).positions)assert(Number.isFinite(p));a.dispose();
});
test('black-hole core is opaque and painter-ordered, not a post-frame cutout',()=>{
 const a=art();for(const t of [0,4,30,60,90]){const f=a.sample(t),k=f.tracks.findIndex(p=>p.object===4&&p.material===6);assert(k>=0);assert.equal(f.alphas[k],1);assert.equal(f.tracks[k].width,0);}
 const s=createSignalTableaux.toString();assert(!s.includes('destination-out'));a.dispose();
});
test('SVG is a generated live pose, not a runtime image asset',()=>{
 const a=art(),s=a.svg({time:31,width:960,height:540});assert(s.startsWith('<svg'));assert(s.includes('CONTINUUM'));assert(!/NaN|Infinity|<image|<script/.test(s));assert((s.match(/<path /g)||[]).length>1200);assert.notEqual(s,a.svg({time:31.5,width:960,height:540}));a.dispose();
});
test('headless source gracefully returns no canvas without a canvas host',()=>{
 const a=art();assert.equal(a.render(),null);a.dispose();a.dispose();assert(a.stats().disposed);assert.equal(a.render(),null);assert.equal(a.composeFallback({},400,225,0,-1,false),false);
});
test('GPU source texture has a 30Hz upload ceiling and a bounded resolution',()=>{
 const host=canvasHost(),a=createSignalTableaux(host),calls={image:0,sub:0,delete:0};
 const gl=new Proxy({createTexture:()=>({}),getUniformLocation:()=>({}),texImage2D:()=>calls.image++,texSubImage2D:()=>calls.sub++,deleteTexture:()=>calls.delete++},{get:(o,k)=>o[k]??noop});const program={};
 for(let i=0;i<121;i++)assert(a.bindGL(gl,program,3840,2160,i/60,-1,false));
 const s=a.stats();assert(s.uploads<=61&&s.uploads>=59);assert(s.textureWidth<=1280&&s.textureHeight<=800);
 const n=s.uploads;a.bindGL(gl,program,3840,2160,2,-1,false);assert.equal(a.stats().uploads,n);
 a.bindGL(gl,program,3840,2160,3,-1,true);const r=a.stats().uploads;
 for(let i=0;i<10;i++)a.bindGL(gl,program,3840,2160,4+i,-1,true);assert.equal(a.stats().uploads,r);
 a.dispose();a.dispose();assert.equal(calls.delete,1);
});
test('production exports and worker serialization retain original host contracts',()=>{
 assert.equal(typeof createIntro2DEngine,'function');assert.equal(typeof createIntroGLEngine,'function');assert(INTRO_GL_SOURCES);
 const engine=readFileSync(new URL('../src/ui/loadingTerminalArt.js',import.meta.url),'utf8');
 assert(engine.includes('tableau?.continuous'));assert(engine.includes('matteRetention'));assert(engine.includes('context-lost'));assert(engine.includes("case 'stop':"));
 assert(engine.includes('createSignalTableaux.toString()'));assert(!engine.includes('CONTINUUM_PLACEHOLDER'));
});
test('preview controls do not reintroduce act selection or a looping time modulo',()=>{
 const html=readFileSync(new URL('../scripts/loading-signal-tableaux-proof.html',import.meta.url),'utf8'),js=readFileSync(new URL('../scripts/loading-signal-tableaux-proof.mjs',import.meta.url),'utf8');
 assert(!html.includes('data-act'));assert(!js.includes('time%32.5'));assert(js.includes('prefers-reduced-motion'));assert(html.includes('Production WebGL2'));
});
