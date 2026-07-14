/** Independent Three.js loader and screen-scale evidence for Helios V12 GLBs. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const EVIDENCE = resolve(HERE, 'evidence/three_final');
const RENDERS = resolve(EVIDENCE, 'renders');
const DEVSHOTS = resolve(EVIDENCE, 'devshots');
const ASSETS = [
  { id: 'place_station_trade_hub', modes: ['close', '120wu', 'contact'] },
  { id: 'place_gate_jump_ring', modes: ['close', 'gameplay'] },
  { id: 'place_asteroid_rock_a', modes: ['close', 'gameplay'] },
  { id: 'place_asteroid_rock_b', modes: ['close', 'gameplay'] },
  { id: 'place_asteroid_rock_c', modes: ['close', 'gameplay'] },
];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary',
  '.png': 'image/png', '.wasm': 'application/wasm', '.json': 'application/json',
};
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();

function writePreviewHtml(outPath) {
  writeFileSync(outPath, `<!doctype html><html><head><meta charset="utf-8"><title>Helios V12 Three evidence</title>
<style>html,body{margin:0;overflow:hidden;background:#07111b}canvas{display:block}</style></head><body>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const p=new URLSearchParams(location.search); const mode=p.get('mode')||'close';
const w=Number(p.get('w')||1200), h=Number(p.get('h')||800), glb=p.get('glb');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(w,h,false); renderer.setPixelRatio(1); renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.22;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x07111b);
scene.add(new THREE.HemisphereLight(0xb9d2e8,0x09111b,1.15));
const key=new THREE.DirectionalLight(0xffe9d2,3.1); key.position.set(-35,55,70); scene.add(key);
const fill=new THREE.DirectionalLight(0x5e9fc9,1.45); fill.position.set(50,25,-40); scene.add(fill);
const rim=new THREE.DirectionalLight(0x43dfff,1.1); rim.position.set(-15,-55,35); scene.add(rim);
const persp=new THREE.PerspectiveCamera(42,w/h,0.05,5000);
const ortho=new THREE.OrthographicCamera(-1,1,1,-1,0.05,5000); let camera=persp;
function screenBounds(box,camera){
  const pts=[]; for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z));
  const projected=pts.map(v=>v.project(camera)); const xs=projected.map(v=>(v.x*.5+.5)*w), ys=projected.map(v=>(-.5*v.y+.5)*h);
  return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
function fit(root){
  const box=new THREE.Box3().setFromObject(root), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z,1), viewDir=new THREE.Vector3(.72,.56,.82).normalize();
  if(mode==='contact'){
    camera=ortho; const span=maxDim*16, aspect=w/h; camera.left=-span*aspect/2; camera.right=span*aspect/2; camera.top=span/2; camera.bottom=-span/2;
    camera.position.copy(center).addScaledVector(viewDir,maxDim*8); camera.lookAt(center); camera.near=.05; camera.far=maxDim*30; camera.updateProjectionMatrix();
  }else{
    camera=persp; const dist=mode==='120wu'?120:(mode==='close'?maxDim*1.55:maxDim*2.8);
    camera.position.copy(center).addScaledVector(viewDir,dist); camera.lookAt(center); camera.near=.05; camera.far=Math.max(2000,dist*20); camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true); return {box,center,size,maxDim};
}
const ktx=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);
loader.load(glb,(gltf)=>{
  const root=gltf.scene; let meshCount=0,triangles=0; const materials=new Set(),names=[];
  root.traverse(o=>{if(!o.isMesh)return; meshCount++; names.push(o.name); const g=o.geometry; if(g.index)triangles+=g.index.count/3; else if(g.attributes.position)triangles+=g.attributes.position.count/3; const list=Array.isArray(o.material)?o.material:[o.material]; list.filter(Boolean).forEach(m=>materials.add(m.name));});
  scene.add(root); const fitInfo=fit(root); renderer.render(scene,camera); const bounds=screenBounds(fitInfo.box,camera);
  const gl=renderer.getContext(), pixels=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let visible=0; for(let i=0;i<pixels.length;i+=4) if(pixels[i]+pixels[i+1]+pixels[i+2]>75) visible++;
  window.__SF_PREVIEW__={ready:true,mode,meshCount,triangles,materials:[...materials].sort(),names,visiblePixels:visible,projectedPixelBounds:bounds,
    proceduralFallback:meshCount<1||visible<20,glbSceneChildren:root.children.length};
},undefined,(err)=>window.__SF_PREVIEW__={ready:false,error:String(err)});
</script></body></html>`, 'utf8');
}

function startServer(){return new Promise(done=>{const server=createServer((req,res)=>{try{const route=decodeURIComponent((req.url||'/').split('?')[0]);const abs=resolve(ROOT,route.replace(/^\//,''));if(!abs.startsWith(ROOT)||!existsSync(abs)){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[extname(abs).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(readFileSync(abs));}catch(e){res.writeHead(500);res.end(String(e));}});server.listen(0,'127.0.0.1',()=>done({server,port:server.address().port}));});}

mkdirSync(RENDERS,{recursive:true}); mkdirSync(DEVSHOTS,{recursive:true});
const htmlPath=resolve(EVIDENCE,'preview.html'); writePreviewHtml(htmlPath);
const {chromium}=await import('playwright'); const {server,port}=await startServer();
const browser=await chromium.launch({headless:true}); const shots=[];
try{
  for(const asset of ASSETS){
    const glbRel=`/assets/ships/m4_helios_hub_v12/release_candidates/places/${asset.id}.glb`;
    for(const mode of asset.modes){
      const size=mode==='contact'?{w:512,h:512}:mode==='close'?{w:1200,h:800}:{w:900,h:700};
      const page=await browser.newPage({viewport:{width:size.w,height:size.h},deviceScaleFactor:1});
      const url=`http://127.0.0.1:${port}/assets/ships/m4_helios_hub_v12/evidence/three_final/preview.html?mode=${mode}&w=${size.w}&h=${size.h}&glb=${encodeURIComponent(glbRel)}`;
      await page.goto(url,{waitUntil:'networkidle',timeout:90000});
      await page.waitForFunction(()=>window.__SF_PREVIEW__&&(window.__SF_PREVIEW__.ready||window.__SF_PREVIEW__.error),null,{timeout:90000});
      const meta=await page.evaluate(()=>window.__SF_PREVIEW__); const shot=`${asset.id}_${mode}`;
      const png=resolve(RENDERS,shot+'.png'),dev=resolve(DEVSHOTS,shot+'.png'); await page.screenshot({path:png,type:'png'}); copyFileSync(png,dev);
      const contactOk=mode!=='contact'||Math.max(meta.projectedPixelBounds?.width||999,meta.projectedPixelBounds?.height||999)<45;
      const ok=!meta.error&&!meta.proceduralFallback&&meta.meshCount>0&&contactOk;
      shots.push({shot,asset:asset.id,mode,ok,contactOk,bytes:statSync(png).size,sha256:sha256(png),...meta});
      console.log(`[v12-three] ${shot} ok=${ok} meshes=${meta.meshCount} px=${JSON.stringify(meta.projectedPixelBounds)}`); await page.close();
    }
  }
}finally{await browser.close();server.close();}
const receipt={schema:'spaceface.runtimeLoaderReceipt.v1',packet:'M4-HELIOS-V12-FINAL',loaderPath:'Three.js GLTFLoader + KTX2Loader + MeshoptDecoder',promote:false,acceptanceClaim:false,shots};
writeFileSync(resolve(EVIDENCE,'runtime_loader_receipt.json'),JSON.stringify(receipt,null,2));
console.log(`[v12-three] complete ${shots.filter(s=>s.ok).length}/${shots.length}`); if(shots.some(s=>!s.ok))process.exitCode=1;
