#!/usr/bin/env node
/** Isolated software-WebGL regression review; NEVER a shipping-camera/performance receipt. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const out = resolve(process.env.VFX_REVIEW_OUT || '.devshots/structured-vfx');
const base = process.env.VFX_REVIEW_BASE || '15b54cd1536457d8bbd8ddfbc198860909945f2a';
const old = path => execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8',maxBuffer:8*1024*1024});
const oldVfx = old('src/render/vfx.js');
const oldPool = old('src/render/combat/instancedSpritePool.js')
  .replace("'../dynamicBufferRanges.js'","'/src/render/dynamicBufferRanges.js'")
  + '\n' + oldVfx.slice(oldVfx.indexOf('function makeGlowTexture()'))
  + '\nexport const baselineTextures=()=>[makeGlowTexture(),makeRingTexture(),makeSmokeTexture(),makeCombustionTexture()];\n';
const oldStructural = old('src/render/combat/arcadeStructuralFx.js')
  .replace("'../weapons/pixelFloor.js'","'/src/render/weapons/pixelFloor.js'");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Transient diagnostic</title>
<style>body{margin:0;background:#090e16;color:#c9d2df;font:14px system-ui}canvas{display:block}header{position:absolute;left:24px;top:18px;pointer-events:none}h1{font-size:19px;margin:0 0 8px}p{margin:3px 0;opacity:.7}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script></head><body>
<header><h1 id="title"></h1><p>Impulse / compression / combustion / smoke / combat blade / combat arc</p><p>Isolated software-WebGL diagnostic. No bloom. Not shipping-game acceptance or hardware performance.</p></header>
<script type="module">
import * as THREE from 'three';
const before=new URLSearchParams(location.search).has('before');
const poolModule=await import(before?'/__baseline/pool.js':'/src/render/combat/instancedSpritePool.js');
const structural=await import(before?'/__baseline/structural.js':'/src/render/combat/arcadeStructuralFx.js');
document.querySelector('#title').textContent=before?'BASE — transient carriers':'CANDIDATE — folded surfaces and density film';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1600,1000);renderer.setPixelRatio(1);renderer.setClearColor(0x090e16);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1.6,.1,180);
camera.position.set(0,28,20);camera.lookAt(0,0,0);
const tex=before?poolModule.baselineTextures():[];
const pool=poolModule.createInstancedSpriteBuckets(scene,32,...tex);
const fx=new structural.ArcadeStructuralFx(scene,{capacities:{blades:4,arcs:4,shards:4}});
const kinds=[false,true,'combustion','smoke'];
const colors=[[.22,.7,1],[.1,.65,1],[1,.26,.06],[.64,.66,.72]];
for(let row=0;row<3;row++) {
 fx.spawnBlade({x:7.5,z:(row-1)*6,y:.3,life:1,length:4.5,width:2.8,color:'#ff8c35',intensity:1.4});
 fx.spawnArc({x:12.5,z:(row-1)*6,y:.3,life:1,length:1.8,width:1.8,color:'#4fbcff',intensity:1.4});
}
window.renderAt=(phase=.15,turn=0)=>{
 camera.position.set(Math.sin(turn)*26,28,Math.cos(turn)*20);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 poolModule.resetInstancedSpriteBuckets(pool);
 for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const t=Math.min(.98,phase+row*.16),c=colors[col];
  poolModule.writeInstancedSpriteFields(pool,kinds[col],(col-2.5)*5,.3,(row-1)*6,
   4.3,4.3,4.3,.13,c[0],c[1],c[2],1-t*.55,t,.31,.13);
 }
 poolModule.commitInstancedSpriteBuckets(pool);
 for(let row=0;row<3;row++) {
  fx.blades.slots[row].age=Math.min(.98,phase+row*.16);
  fx.arcs.slots[row].age=Math.min(.98,phase+row*.16);
 }
 fx.update(0,camera,1000);
 renderer.render(scene,camera);
 return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
  programs:renderer.info.programs.length,textures:renderer.info.memory.textures,
  vendor:renderer.getContext().getParameter(renderer.getContext().RENDERER)};
};
window.renderAt(.05);window.ready=true;
</script></body></html>`;

await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let content;
    if(url.pathname==='/review.html') content=html;
    else if(url.pathname==='/__baseline/pool.js') content=oldPool;
    else if(url.pathname==='/__baseline/structural.js') content=oldStructural;
    else {
      const path=resolve(root,'.'+decodeURIComponent(url.pathname));
      if(!path.startsWith(root+sep)) throw new Error('Outside review root');
      content=await readFile(path);
    }
    res.setHeader('Content-Type',url.pathname.endsWith('.html')?'text/html':'application/javascript');
    res.end(content);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const report={schema:'spaceface.structuredVfxDiagnostic.v1',base,
  evidenceClass:'isolated-software-WebGL-not-shipping-acceptance',sourceHashes:{},errors:[],frames:[]};
try {
  for(const path of ['src/render/vfx.js','src/render/combat/instancedSpritePool.js',
    'src/render/combat/structuredBurstGeometry.js','src/render/combat/transientVfxMaterials.js',
    'src/render/combat/densityVolumeData.js','src/render/combat/arcadeStructuralFx.js']) {
    report.sourceHashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');
  }
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const mode of ['before','after']) {
    const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
    page.on('pageerror',err=>report.errors.push({mode,error:String(err)}));
    page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon')) report.errors.push({mode,error:msg.text()});});
    await page.goto(`http://127.0.0.1:${server.address().port}/review.html${mode==='before'?'?before':''}`);
    await page.waitForFunction(()=>window.ready===true,{timeout:30000});
    for(const [name,phase,turn] of [['early',.05,0],['middle',.25,0],['late',.6,0],['oblique',.18,.72]]) {
      const stats=await page.evaluate(([t,a])=>window.renderAt(t,a),[phase,turn]);
      await page.screenshot({path:resolve(out,`${mode}-${name}.png`)});
      report.frames.push({mode,name,phase,turn,...stats});
    }
    if(mode==='after') {
      for(let frame=0;frame<24;frame++) {
        await page.evaluate(t=>window.renderAt(t,0),.015+frame/30);
        await page.screenshot({path:resolve(out,`motion-${String(frame).padStart(2,'0')}.png`)});
      }
    }
    await page.close();
  }
} catch(error) {report.errors.push({error:String(error)});}
finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if(report.errors.length) process.exitCode=1;
