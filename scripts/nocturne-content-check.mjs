// Focused authoring/shader validation, not gameplay acceptance. Uses the canonical server,
// production adapters/director/illustrated material, exact vendored Three and no player saves.
// Geometry is deliberately synthetic; its camera matches the default chase pose in camera.js.
// Outputs are diagnostic evidence under .devshots unless --out explicitly selects a retained path.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const { PNG } = require('pngjs');
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));
if (args.help) {
  console.log('NOCTURNE content: --out=<directory> --asset-cache=<repository-shaped cache> --width=960 --height=540 --samples=8 --headed; SF_GL=swiftshader and SF_BROWSER_EXECUTABLE=/path/to/chrome. Cached Kestrel GLB is verified against HEAD before use.');
  process.exit(0);
}
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Math.trunc(Number(value)))) : fallback;
const width = bounded(args.width, 960, 640, 2560), height = bounded(args.height, 540, 360, 1440);
const samples = bounded(args.samples, 8, 4, 60);
const OUT = path.resolve(ROOT, String(args.out || '.devshots/nocturne-content'));
const softwareRequested = process.env.SF_GL === 'swiftshader';
const executablePath = process.env.SF_BROWSER_EXECUTABLE || process.env.CHROMIUM_EXECUTABLE_PATH;
if (executablePath && !existsSync(executablePath)) throw new Error('Browser executable does not exist: ' + executablePath);
const assetPath = 'assets/ships/release/render-packages/kestrel/render.glb';
let authoredAsset = null, assetIdentity = null;
if (args['asset-cache']) {
  authoredAsset = await readFile(path.join(path.resolve(String(args['asset-cache'])), assetPath));
  const expected = execFileSync('git', ['ls-tree', 'HEAD', '--', assetPath], { cwd: ROOT, encoding: 'utf8' }).trim().split(/\s+/)[2];
  const actual = createHash('sha1').update('blob ' + authoredAsset.length + '\0').update(authoredAsset).digest('hex');
  assert.equal(actual, expected, 'Authored asset must exactly match the current immutable git tree.');
  assetIdentity = { path: assetPath, gitBlobSha1: actual, bytes: authoredAsset.length,
    materialPipeline: 'Vendored GLTFLoader/KTX2/Meshopt, configureAuthoredMaterialProfiles, illustratedSurface; direct GLB geometry, not the game render-package draw plan.' };
}

const fixture = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>
body{margin:0;background:#010207;color:#9aacc0;font:11px/1.4 system-ui,sans-serif}canvas{display:block}
#label{position:fixed;top:14px;left:18px;pointer-events:none;letter-spacing:.08em}b{color:#d4dee9}
</style><script>window.nocturneContentPhase='html';</script><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/addons/"}}</script></head><body>
<div id="label"><b>NOCTURNE / CONTENT &amp; PHYSICAL SURFACES</b><br><span id="mode"></span><br>AUTHORING RIG · DEFAULT CHASE CAMERA · NO GAMEPLAY ACCEPTANCE</div>
<script type="module">
import * as THREE from 'three';
import { createBloom } from '/src/render/bloom.js';
import { createNocturneAtmosphere } from '/src/render/nocturne/atmosphere.js';
import { NocturneRegistry } from '/src/render/nocturne/registry.js';
import { NocturneDirector } from '/src/render/nocturne/director.js';
import { NocturneContent } from '/src/render/nocturne/content.js';
import { NocturneHeadlightSources } from '/src/render/nocturne/headlightSources.js';
import { installIllustratedSurface, ILLUSTRATED_SURFACE_KEY } from '/src/render/illustratedSurface.js';
import { beginLookMood } from '/src/render/look.js';
import { configureAuthoredMaterialProfiles } from '/src/render/authoredMaterialProfiles.js';
window.nocturneContentPhase='imports';
const width=${width},height=${height};
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(width,height);renderer.setPixelRatio(1);renderer.toneMapping=THREE.NoToneMapping;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;renderer.info.autoReset=false;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x010207);
const camera=new THREE.PerspectiveCamera(50,width/height,1,14000);
camera.position.set(0,144*Math.sin(Math.PI/3),-144*Math.cos(Math.PI/3));camera.lookAt(0,0,0);camera.updateMatrixWorld();
const ambient=new THREE.AmbientLight(0xa8c3e8,.018);scene.add(ambient);
// Keep the directional census fixed at one even for the dark rig. This compiles the production
// shader's actual local/sun split, then the bright comparison exercises it without recompiling.
const sun=new THREE.DirectionalLight(0xfff0dc,0);sun.position.set(-40,80,-30);scene.add(sun);
const registry=new NocturneRegistry({capacity:256});
const director=new NocturneDirector(scene,{registry,renderer,pointCount:8,spotCount:3,shadowCount:1,shadowResolution:512,profile:true});
const content=new NocturneContent(registry);const headlights=new NocturneHeadlightSources(registry,{capacity:2});
const atmosphere=createNocturneAtmosphere(renderer,width,height,{quality:'integrated'});
atmosphere.setLights(director.slots.map(slot=>slot.light));
const bloom=createBloom(renderer,width,height);bloom.attachAtmosphere(atmosphere);
bloom.setOptions({bloom:false,exposure:.9,grain:0,vignette:0,grade:0,toe:0});window.nocturneContentPhase='prepare-post';await bloom.prepareResources();
window.nocturneContentPhase='build-fixtures';
const membrane={toLocal(p,out){out.x=p.x;out.z=p.z;return out;}};
const metal=new THREE.MeshStandardMaterial({color:0x687581,roughness:.42,metalness:.45});installIllustratedSurface(metal);
const paint=new THREE.MeshStandardMaterial({color:0x5a646e,roughness:.55,metalness:.12});installIllustratedSurface(paint);
const dark=new THREE.MeshStandardMaterial({color:0x242c3a,roughness:.62,metalness:.3});installIllustratedSurface(dark);
const glossy=new THREE.MeshStandardMaterial({color:0x9babb9,roughness:.2,metalness:.78});installIllustratedSurface(glossy);
const rock=new THREE.MeshStandardMaterial({color:0x39413e,roughness:.87,metalness:.06});installIllustratedSurface(rock);
const fixtures={};const roots=[];const emitters=[];const geometries=[];const materials=[metal,paint,dark,glossy,rock];
function mesh(root,geometry,material,x,y,z){const m=new THREE.Mesh(geometry,material);geometries.push(geometry);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
function box(root,size,pos,mat=metal){return mesh(root,new THREE.BoxGeometry(...size),mat,...pos);}
function bulb(root,name,pos,color,size=1.25){
  const m=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.3,roughness:.5,metalness:0});installIllustratedSurface(m);materials.push(m);
  const node=mesh(root,new THREE.SphereGeometry(size,8,6),m,...pos);node.name=name;node.castShadow=false;emitters.push(node);return node;
}
function rootFor(id,type,profile,radius,data={}){
  const root=new THREE.Group();root.name=id;root.userData.nocturne={profile};root.visible=false;scene.add(root);roots.push(root);
  const entity={id,type,alive:true,pos:{x:0,z:0},rot:0,radius,hull:100,hullMax:100,data};return{root,entity};
}
function deck(root){
  for(let z=-35;z<=35;z+=14)box(root,[116,2,13.5],[0,-2,z],paint);
  for(let x=-54;x<=54;x+=27)box(root,[2,2.5,86],[x,-1.7,0],dark);
  box(root,[118,3,2],[0,-.5,44],metal);box(root,[118,3,2],[0,-.5,-44],metal);
}
function cargo(root,x,z,size=10){box(root,[size,8,size],[x,3,z],metal);box(root,[size+1,1,size+1],[x,7.5,z],dark);}
{
 const f=rootFor('industrial-foundry','station','industrial',55,{archetypeGlb:'place_station_foundry'});const r=f.root;deck(r);
 box(r,[5,29,5],[-41,13,17],dark);box(r,[49,4,5],[-19,28,17],metal);
 bulb(r,'SOCKET_Light_Gantry',[-39,26,14],0xffb45e,1.8);
 box(r,[18,20,25],[41,8,18],dark);box(r,[2,18,27],[30.5,8,18],metal);
 bulb(r,'SOCKET_Light_Furnace',[29,8,18],0xff702b,3.3);
 box(r,[18,3,12],[-30,5,-25],metal);bulb(r,'SOCKET_Light_Work',[-30,10,-25],0x75c8ff);
 cargo(r,-9,2,13);cargo(r,18,-21,11);cargo(r,-10,-27,8);
 mesh(r,new THREE.SphereGeometry(6,16,10),glossy,16,5,17);
 fixtures.industrial={...f,mood:'sodium_yard',description:'Elevated amber gantry, lateral furnace aperture and isolated cyan workbench.'};
}
{
 const f=rootFor('derelict-pressure-hull','wreck','derelict',55,{emergencyLight:true,unstableReactor:{vented:false},smoke:true});const r=f.root;
 for(let x=-47;x<=47;x+=18)box(r,[17.2,2,62],[x,-2,0],dark);
 for(const z of [-27,27])for(const x of [-40,0,40])box(r,[25,11,3],[x,3.5,z],metal);
 box(r,[3,15,31],[-16,5.5,10],paint);box(r,[3,15,24],[21,5.5,-15],paint);
 bulb(r,'SOCKET_Light_Emergency',[41,8,-24],0xff3349,1.2);bulb(r,'warning_aft',[-43,5,21],0xff3349,1.2);
 bulb(r,'SOCKET_Reactor',[-6,3,-2],0x70e4ff,2.3);cargo(r,33,10,9);
 mesh(r,new THREE.CylinderGeometry(5,5,18,12),glossy,-29,4,-10).rotation.z=Math.PI/2;
 fixtures.derelict={...f,mood:'cold_drift',description:'Broken compartments, separated emergency batteries and a low leaking core.'};
}
{
 const f=rootFor('combat-player','ship','ship',12,{thrust:.8});const r=f.root;r.position.set(-37,0,-10);f.entity.pos={x:-37,z:-10};
 box(r,[24,5,12],[0,1,0],paint);box(r,[10,2,23],[-4,0,0],metal);box(r,[8,3,7],[2,4,0],dark);
 bulb(r,'HOOK_DRIVE_CORE',[-12,1,0],0x57cfff,1.4);bulb(r,'HOOK_NAV_PORT',[3,1,-11],0xff4057,.65);bulb(r,'HOOK_NAV_STARBOARD',[3,1,11],0x57ffad,.65);
 const socket=new THREE.Object3D();socket.name='HOOK_HEADLIGHT';socket.position.set(12,7,0);socket.rotation.z=-.14;r.add(socket);
 const target=rootFor('combat-target','ship','ship',12,{thrust:.5});target.root.position.set(25,0,5);target.entity.pos={x:25,z:5};target.root.rotation.y=.23;target.entity.rot=-.23;
 box(target.root,[30,7,15],[0,1,0],paint);box(target.root,[10,2,23],[-7,0,0],metal);
 bulb(target.root,'HOOK_DRIVE_CORE',[-15,1,0],0xff702b,1.5);bulb(target.root,'HOOK_NAV_PORT',[4,2,-10],0xff4057,.65);bulb(target.root,'HOOK_NAV_STARBOARD',[4,2,10],0x57ffad,.65);
 const debris=new THREE.Group();scene.add(debris);roots.push(debris);debris.visible=false;
 for(const [x,z] of [[-3,-24],[8,29],[46,-21],[-49,26]])mesh(debris,new THREE.DodecahedronGeometry(5,0),rock,x,0,z);
 fixtures.combat={...f,others:[target],extra:[debris],mood:'neon_noir',description:'Moving bow searchlight, aft drive pools and small navigation sources in clear vacuum.'};
}
{
 const f=rootFor('alien-spore-organism','fauna','alien',51,{ecology:{speciesId:'nebular_hive'},growth:.9,sporeDensity:.5});const r=f.root;
 for(let i=0;i<7;i++){const x=Math.sin(i*2.4)*35,z=Math.cos(i*2.4)*28;mesh(r,new THREE.DodecahedronGeometry(12-i*.6,1),rock,x,2,z);}
 bulb(r,'SOCKET_Bioluminescence',[9,5,5],0x9fff53,3);bulb(r,'alien-crown',[-20,15,-12],0xb170ff,2);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;const bone=mesh(r,new THREE.CylinderGeometry(1.1,2,22,6),paint,Math.cos(a)*14,8,Math.sin(a)*12);bone.rotation.z=Math.cos(a)*.45;bone.rotation.x=Math.sin(a)*.45;}
 // A translated instance exercises the actual mvPosition path of the probe hook.
 const geometry=new THREE.DodecahedronGeometry(4,0);geometries.push(geometry);
 const instances=new THREE.InstancedMesh(geometry,glossy,3);instances.castShadow=true;instances.receiveShadow=true;
 const m=new THREE.Matrix4();for(let i=0;i<3;i++)instances.setMatrixAt(i,m.makeTranslation(-30+i*23,1,-28));r.add(instances);
 fixtures.alien={...f,mood:'void_signal',description:'Low green biological pool, elevated violet crown, particulate spores and translated instanced metal debris.'};
}
let assetLoader=null;
if(${!!authoredAsset}){
 window.nocturneContentPhase='decode-pinned-kestrel';
 const [{GLTFLoader},{KTX2Loader},{MeshoptDecoder}]=await Promise.all([
   import('three/addons/loaders/GLTFLoader.js'),import('three/addons/loaders/KTX2Loader.js'),import('three/addons/libs/meshopt_decoder.module.js')]);
 assetLoader=new KTX2Loader().setTranscoderPath('/vendor/addons/libs/basis/').detectSupport(renderer);
 const gltf=await new GLTFLoader().setKTX2Loader(assetLoader).setMeshoptDecoder(MeshoptDecoder).loadAsync('/__nocturne-authored.glb');
 const model=gltf.scene;model.traverse(node=>{if(/COLLISION|^LOD[12]_|^LOD[12]$/.test(node.name))node.visible=false;});
 configureAuthoredMaterialProfiles(model,{assetId:'kestrel',slot:'hull'});
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const scale=30/Math.max(size.x,size.z);model.position.copy(center).multiplyScalar(-scale);model.scale.setScalar(scale);
 model.traverse(node=>{if(!node.isMesh)return;node.castShadow=true;node.receiveShadow=true;geometries.push(node.geometry);
   for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(!materials.includes(mat))materials.push(mat);
     if(mat.emissive&&mat.emissive.r+mat.emissive.g+mat.emissive.b>.03&&mat.emissiveIntensity>.05&&!emitters.includes(node))emitters.push(node);}});
 const target=fixtures.combat.others[0];target.root.clear();target.root.add(model);
 fixtures.combat.description+=' The illuminated target is the exact HEAD Kestrel release GLB with authored textures/material profiles (normalized to a 30 WU hull).';
}
let current=null,mode='on';let state={};let meshes=new Map();
function select(name){
 content.clear();headlights.clear();for(const r of roots)r.visible=false;
 current=fixtures[name];if(!current)throw new Error('Unknown fixture '+name);sun.intensity=0;ambient.intensity=.018;
 const entries=[current,...(current.others||[])];for(const f of entries)f.root.visible=true;for(const r of current.extra||[])r.visible=true;
 const observer={id:'observer',type:'observer',alive:true,pos:{x:0,z:0},data:{}};
 const list=entries.map(f=>f.entity);if(name!=='combat')list.push(observer);
 state={entityList:list,entities:new Map(list.map(e=>[e.id,e])),playerId:name==='combat'?current.entity.id:'observer',simTime:1.75,run:{phase:name==='combat'?'active':'idle'}};
 meshes=new Map(entries.map(f=>[f.entity.id,f.root]));beginLookMood(current.mood,0);scene.updateMatrixWorld(true);step(24);
 return {name,description:current.description};
}
function step(count=1){for(let i=0;i<count;i++){
 content.probes.enabled=mode==='on'||mode==='probe'||mode==='composed';
 content.update(state,1/60,membrane,{meshes,camera,reducedFlash:true});
 headlights.update(state,1/60,membrane,{meshes});
 director.update(1/60,camera,{enabled:mode!=='off'&&mode!=='probe',casterEpoch:content.casterEpoch,renderer});
 scene.updateMatrixWorld(true);
}atmosphere.setMedia(content.media);}
function diagnostics(){return{composition:content.compositionId,content:{...content.diagnostics},director:{...director.getDiagnostics()},
 probes:content.probes.count,media:content.media.map(m=>({id:m.id,center:m.center.toArray(),radii:m.radii.toArray(),density:m.density})),
 exposure:content.exposureTarget,exposureRange:content.exposureRange.slice(),
 sources:registry.sources.filter(s=>s.enabled).map(s=>({id:s.id,type:s.type,position:s.position.toArray(),target:s.target.toArray(),intensity:s.intensity,color:s.color.toArray()})),
 programs:renderer.info.programs.length,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
 geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,atmosphere:atmosphere.getDiagnostics()};}
function render(next=mode,count=2){mode=next;step(24);
 atmosphere.setEnabled(mode==='composed');bloom.setOptions({bloom:mode==='composed',exposure:content.exposureTarget});
 document.querySelector('#mode').textContent=current.entity.id.toUpperCase()+' / '+mode.toUpperCase()+(mode==='composed'?' / MEDIA + BLOOM':' / BLOOM OFF · MEDIA OFF');
 for(let i=0;i<count;i++){renderer.info.reset();bloom.render(scene,camera);}return diagnostics();}
function emitterRects(){const corners=[],v=new THREE.Vector3();for(const e of emitters){
 if(!e.parent?.visible)continue;let visible=true;for(let p=e;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;
 const b=new THREE.Box3().setFromObject(e);let x0=width,y0=height,x1=0,y1=0;
 for(let i=0;i<8;i++){v.set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).project(camera);
 const x=(v.x*.5+.5)*width,y=(-v.y*.5+.5)*height;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 corners.push([x0-4,y0-4,x1+4,y1+4]);}return corners;}
function renderMask(){const hidden=[];for(const e of emitters)if(e.visible){e.visible=false;hidden.push(e);}
 const background=scene.background;scene.background=new THREE.Color(0);scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0xffffff});
 document.querySelector('#label').style.display='none';renderer.setRenderTarget(null);renderer.render(scene,camera);
 scene.overrideMaterial.dispose();scene.overrideMaterial=null;scene.background=background;for(const e of hidden)e.visible=true;
}
function restoreLabel(){document.querySelector('#label').style.display='';}
async function measure(count){const times={off:[],on:[]};
 for(let i=0;i<count;i++)for(const key of i%2?['on','off']:['off','on']){mode=key;step(24);atmosphere.setEnabled(false);bloom.setOptions({bloom:false});
 await new Promise(resolve=>requestAnimationFrame(resolve));renderer.info.reset();const start=performance.now();bloom.render(scene,camera);times[key].push(performance.now()-start);}
 return times;}
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
window.nocturneContent={select,render,renderMask,restoreLabel,emitterRects,diagnostics,measure,
 setBrightMood(){beginLookMood('arcade',0);sun.intensity=1.3;ambient.intensity=.035;},
 identity:{threeRevision:THREE.REVISION,illustratedSurfaceKey:ILLUSTRATED_SURFACE_KEY,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
 vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),webgl2:renderer.capabilities.isWebGL2,
 viewport:{width,height},camera:{fov:50,distance:144,tilt:60,position:camera.position.toArray(),near:1,far:14000},
 directBudget:{points:8,spots:3,shadows:1,shadowResolution:512,directionals:1},
 geometry:${JSON.stringify(authoredAsset ? 'Synthetic industrial, derelict and alien authoring rigs; combat target is the exact pinned Kestrel release GLB. No running simulation.' : 'Synthetic authoring rigs; no release GLB assets or running simulation.')}},
 dispose(){headlights.dispose();content.dispose();director.dispose();bloom.attachAtmosphere(null);atmosphere.dispose();bloom.dispose();
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();assetLoader?.dispose();renderer.dispose();}};
window.nocturneContentPhase='first-render';select('industrial');render('on');window.nocturneContentReady=true;
</script></body></html>`;

const server = createGameServer({ root: ROOT, devDiagnostics: false, extraRoutes: [{
  test: (_method, url) => url === '/__nocturne-content',
  handle(_req, res) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fixture); },
}, {
  test: (_method, url) => url === '/__nocturne-authored.glb',
  handle(_req, res) { res.writeHead(authoredAsset ? 200 : 404, { 'Content-Type': 'model/gltf-binary' }); res.end(authoredAsset); },
}] });
function compareSurfaces(first, second, maskBytes, rectangles) {
  const a=PNG.sync.read(first),b=PNG.sync.read(second),mask=PNG.sync.read(maskBytes);
  let pixels=0,changed=0,nonzero=0,sum=0,maximum=0;const rgb=[0,0,0];
  for(let y=72;y<a.height;y++)for(let x=0;x<a.width;x++){
    const offset=(y*a.width+x)*4;if(mask.data[offset]<200||rectangles.some(r=>x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3]))continue;
    pixels++;let delta=0;for(let c=0;c<3;c++){const d=a.data[offset+c]-b.data[offset+c];rgb[c]+=d;delta+=Math.abs(d);maximum=Math.max(maximum,Math.abs(d));}
    sum+=delta;if(delta>=6)changed++;if(delta>0)nonzero++;
  }
  return{surfacePixels:pixels,changedSurfacePixels:changed,nonzeroSurfacePixels:nonzero,meanAbsoluteRgbByteDelta:sum/Math.max(1,pixels*3),
    meanSignedRgbByteDelta:rgb.map(v=>v/Math.max(1,pixels)),maximumByteDelta:maximum,
    excluded:'Header, all background, projected emitter bounding boxes plus a four pixel margin.'};
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const median = values => values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
let browser;const errors=[];const cells={};
try {
  await mkdir(OUT,{recursive:true});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const {chromium}=await loadPlaywright();const browserArgs=['--no-sandbox','--disable-background-timer-throttling'];
  if(softwareRequested)browserArgs.push('--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
  browser=await chromium.launch({headless:!args.headed,args:browserArgs,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/__nocturne-content',{waitUntil:'load',timeout:60000});
  try { await page.waitForFunction(()=>window.nocturneContentReady===true,null,{timeout:60000}); }
  catch(error) { errors.push('Last phase: '+await page.evaluate(()=>window.nocturneContentPhase));throw error; }
  const identity=await page.evaluate(()=>window.nocturneContent.identity);
  for(const name of ['industrial','derelict','combat','alien']){
    const authoring=await page.evaluate(name=>window.nocturneContent.select(name),name);
    const rectangles=await page.evaluate(()=>window.nocturneContent.emitterRects());
    await page.evaluate(()=>window.nocturneContent.renderMask());const mask=await page.screenshot();
    await writeFile(path.join(OUT,'content-'+name+'-surface-mask.png'),mask);
    await page.evaluate(()=>window.nocturneContent.restoreLabel());
    const cell={authoring,modes:{}};const images={};
    for(const mode of ['off','direct','on','probe','composed']){
      cell.modes[mode]=await page.evaluate(mode=>window.nocturneContent.render(mode,mode==='composed'?12:2),mode);
      images[mode]=await page.screenshot();await writeFile(path.join(OUT,'content-'+name+'-'+mode+'.png'),images[mode]);
    }
    cell.directVsOff=compareSurfaces(images.direct,images.off,mask,rectangles);
    cell.onVsOff=compareSurfaces(images.on,images.off,mask,rectangles);
    cell.probeVsOff=compareSurfaces(images.probe,images.off,mask,rectangles);
    cell.programsStableAcrossToggle=cell.modes.off.programs===cell.modes.on.programs&&cell.modes.off.programs===cell.modes.direct.programs;
    if(name==='industrial'){
      await page.evaluate(()=>window.nocturneContent.setBrightMood());
      const bright={mood:'arcade',sunIntensity:1.3,ambientIntensity:.035,images:{}};
      for(const mode of ['off','direct']){
        bright[mode]=await page.evaluate(mode=>window.nocturneContent.render(mode),mode);
        await page.evaluate(()=>{document.querySelector('#mode').textContent+=' / BRIGHT ARCADE + SUN';});
        bright.images[mode]=await page.screenshot();await writeFile(path.join(OUT,'content-industrial-bright-'+mode+'.png'),bright.images[mode]);
      }
      bright.directVsOff=compareSurfaces(bright.images.direct,bright.images.off,mask,rectangles);delete bright.images;
      assert.ok(bright.directVsOff.changedSurfacePixels>1000,'The authored lamps must still illuminate real surfaces under the bright sun/mood.');
      cell.brightComparison=bright;
      await page.evaluate(()=>window.nocturneContent.select('industrial'));
    }
    const raw=await page.evaluate(count=>window.nocturneContent.measure(count),samples);
    cell.submitTiming={samplesPerMode:samples,offMedianMs:median(raw.off),onMedianMs:median(raw.on),raw};
    cell.submitTiming.incrementalMedianMs=cell.submitTiming.onMedianMs-cell.submitTiming.offMedianMs;
    cells[name]=cell;
    console.log(name+': '+cell.directVsOff.changedSurfacePixels+' lit non-emissive pixels; '+cell.modes.on.programs+' programs; '+cell.modes.on.director.active+' resident lights');
    assert.ok(cell.directVsOff.changedSurfacePixels>1000,name+' direct light must illuminate adjacent non-emissive surfaces.');
    assert.ok(cell.programsStableAcrossToggle,name+' toggling sources must not introduce shader permutations.');
    assert.equal(cell.modes.on.composition,name);
    if(name==='combat')assert.equal(cell.modes.on.media.length,0,'Combat vacuum must be clear.');
    else assert.ok(cell.probeVsOff.nonzeroSurfacePixels>100,name+' authored probe contribution must reach physical surfaces.');
  }
  assert.equal(errors.length,0,'Browser shader/errors: '+errors.join('\n'));
  const paths=['scripts/nocturne-content-check.mjs','src/data/nocturneLighting.js','src/render/nocturne/content.js','src/render/nocturne/probes.js',
    'src/render/nocturne/registry.js','src/render/nocturne/director.js','src/render/nocturne/headlightSources.js','src/render/nocturne/atmosphere.js',
    'src/render/illustratedSurface.js','src/render/authoredMaterialProfiles.js','src/render/look.js','src/data/lookMoods.js',
    'src/render/camera.js','src/render/bloom.js','vendor/three.module.js','vendor/three.core.js'];
  const hashes={};for(const relative of paths)hashes[relative]=hash(await readFile(path.join(ROOT,relative)));
  let parentCommit=null;try{parentCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();}catch{}
  const report={schema:'spaceface.nocturne.content-evidence.v1',createdAt:new Date().toISOString(),
    verdict:'PASS — focused content, physical illumination and shader validation',gameplayAcceptance:false,hardwareAcceptance:false,
    evidenceClass:identity.geometry+' Production lighting/material modules at the documented gameplay camera.',
    performanceCaveat:'CPU submit timing only, with the same fixed-light shader on both sides; no target GPU budget, baseline renderer comparison or frame-pacing acceptance.',
    source:{parentCommit,workingTreeContentPinnedBySha256:true,hashes},host:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,node:process.version},
    browser:{version:browser.version(),softwareRequested},identity,authoredAsset:assetIdentity,cells,errors};
  await writeFile(path.join(OUT,'content-report.json'),JSON.stringify(report,null,2)+'\n');
  let markdown='# NOCTURNE authored content shader validation\n\n**'+report.verdict+'.** '+report.evidenceClass+' This is not public-route or target-hardware acceptance.\n\n';
  markdown+='Renderer: `'+identity.renderer+'`. Three revision '+identity.threeRevision+', material hook `'+identity.illustratedSurfaceKey+'`. Camera: 144 WU, 60° tilt, 50° vertical field of view; '+width+'×'+height+'.\n\n';
  markdown+='Eight fixed points, three fixed spots and one 512² shadow map. Direct and probe comparisons keep bloom and atmosphere off and preserve emitter materials. Pixel measurements exclude emitters, background and the label.\n\n';
  markdown+='| Composition | Direct surface pixels (summed RGB delta ≥6) | Direct mean absolute RGB byte delta | Probe surface pixels (any nonzero delta) | Probe mean absolute RGB byte delta | Shader programs stable |\n|---|---:|---:|---:|---:|---|\n';
  for(const [name,c]of Object.entries(cells))markdown+='| '+name+' | '+c.directVsOff.changedSurfacePixels+' | '+c.directVsOff.meanAbsoluteRgbByteDelta.toFixed(2)+' | '+c.probeVsOff.nonzeroSurfacePixels+' | '+c.probeVsOff.meanAbsoluteRgbByteDelta.toFixed(3)+' | '+c.programsStableAcrossToggle+' |\n';
  markdown+='\nThe derelict probe is deliberately subtle; a nonzero pixel confirms shader transport, not strong visual contribution. Direct illumination is evaluated separately with a larger change threshold.\n\n';
  markdown+='The same industrial composition was also checked under the bright Arcade Look, a 1.3-strength directional key and 0.035 ambient, retaining the same exposure. Direct illumination changes '+cells.industrial.brightComparison.directVsOff.changedSurfacePixels+' non-emissive pixels. The fixed directional census compiles/exercises the real shader local/sun split.\n\n';
  markdown+='| Bright mood, local sources off | Bright mood, direct sources on |\n|---|---|\n| ![Bright off](content-industrial-bright-off.png) | ![Bright direct](content-industrial-bright-direct.png) |\n\n';
  if(assetIdentity)markdown+='Combat target: ['+assetIdentity.path+'](../../../'+assetIdentity.path+'), git blob SHA-1 `'+assetIdentity.gitBlobSha1+'`. '+assetIdentity.materialPipeline+'\n\n';
  markdown+='\n'+report.performanceCaveat+' Raw submit timings and source SHA-256 identities are in [content-report.json](content-report.json).\n\n';
  for(const [name,c]of Object.entries(cells)){markdown+='## '+name+'\n\n'+c.authoring.description+'\n\n';
    markdown+='| Local lighting off | Direct light only | Complete composition |\n|---|---|---|\n';
    markdown+='| ![Off](content-'+name+'-off.png) | ![Direct](content-'+name+'-direct.png) | ![Composed](content-'+name+'-composed.png) |\n\n';}
  await writeFile(path.join(OUT,'content-validation.md'),markdown);
  await page.evaluate(()=>window.nocturneContent.dispose());
  console.log('NOCTURNE content validation passed: '+OUT);
} catch(error) {
  await writeFile(path.join(OUT,'content-failure.json'),JSON.stringify({error:String(error),errors,cells},null,2)+'\n').catch(()=>{});
  throw error;
} finally {
  if(browser)await browser.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));
}
