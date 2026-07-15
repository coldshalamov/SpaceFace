#!/usr/bin/env node
/** Isolated Kestrel Borrowed Time V3 Meshopt/KTX2 finalizer + Three.js proof. */
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, renameSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/kestrel_borrowed_time_v3');
const SOURCE = resolve(FAMILY, 'source/wholeships/kestrel_borrowed_time_v3.glb');
const CANDIDATE = resolve(FAMILY, 'release_candidates/wholeships/kestrel_borrowed_time_v3.glb');
const EVIDENCE = resolve(FAMILY, 'evidence');
const DEVSHOTS = resolve(EVIDENCE, 'devshots');
const THREE = resolve(EVIDENCE, 'three');
const PACKET = 'PROFESSIONAL-KESTREL-BORROWED-TIME-V3-CODEX-001';
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus', 'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const rel = (path) => path.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');

function decodeImage(buffer) {
  try {
    const png = PNG.sync.read(Buffer.from(buffer));
    return { width: png.width, height: png.height,
      data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
  } catch {
    const jpg = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return { width: jpg.width, height: jpg.height,
      data: new Uint8Array(jpg.data.buffer, jpg.data.byteOffset, jpg.data.byteLength) };
  }
}

function raw(path) {
  const buffer = readFileSync(path);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) {
      const doc = JSON.parse(buffer.subarray(offset, offset + length).toString('utf8').replace(/\0+$/, '').trim());
      const images = doc.images || [];
      const views = doc.bufferViews || [];
      return {
        doc,
        images: images.length,
        textures: (doc.textures || []).length,
        ktx2: images.filter((x) => /ktx|basis/i.test(x.mimeType || '')).length,
        meshopt: views.filter((x) => x.extensions?.EXT_meshopt_compression).length,
        nodes: (doc.nodes || []).map((x) => x.name).filter(Boolean),
        materials: (doc.materials || []).map((x) => x.name).filter(Boolean),
        extensions: doc.extensionsUsed || [],
        metadata: doc.asset?.extras?.spacefaceAsset || {},
      };
    }
    offset += length;
  }
  throw new Error(`GLB JSON missing: ${path}`);
}

function splitTextureSlots(document) {
  for (const material of document.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    const normal = material.getNormalTexture();
    if (!base || !normal || base !== normal || !normal.getImage()) continue;
    const clone = document.createTexture(`${normal.getName() || 'normal'}_slot`)
      .setImage(normal.getImage()).setMimeType(normal.getMimeType());
    material.setNormalTexture(clone);
  }
}

function ensureCollisionProxy(document) {
  const root = document.getRoot();
  if (root.listNodes().some((node) => node.getName() === 'COLLISION_HULL')) return;
  const donor = root.listNodes().find((node) =>
    /LOD2_Merged_Material_Hull/i.test(node.getName() || '') && node.getMesh());
  if (!donor) throw new Error('LOD2 hull unavailable for collision proxy');
  const collision = document.createNode('COLLISION_HULL')
    .setMesh(donor.getMesh())
    .setExtras({ collision: true, nonRender: true,
      spaceface: { collision: true, helper: true, nonRender: true, role: 'collision' } });
  const scene = root.listScenes()[0] || document.createScene('Scene');
  scene.addChild(collision);
}

async function atomicWrite(io, document, target) {
  const temp = `${target}.tmp.${process.pid}.${Date.now()}.glb`;
  await io.write(temp, document);
  if (existsSync(target)) unlinkSync(target);
  renameSync(temp, target);
}

function stamp(document, sourceTextures, proof) {
  const root = document.getRoot();
  const asset = root.getAsset();
  asset.generator = `${asset.generator || ''}; SpaceFace finalize_kestrel_borrowed_time_v3_candidate.mjs`;
  asset.extras = {
    ...(asset.extras || {}),
    assetId: 'SF_WHOLESHIP_KESTREL_BORROWED_TIME_V3',
    partId: 'wholeship_kestrel_borrowed_time_v3',
    spacefaceAsset: {
      ...(asset.extras?.spacefaceAsset || {}),
      contractVersion: 1,
      assetId: 'SF_WHOLESHIP_KESTREL_BORROWED_TIME_V3',
      partId: 'wholeship_kestrel_borrowed_time_v3',
      slot: 'hull', category: 'wholeships', family: 'kestrel_borrowed_time_v3',
      packet: PACKET, forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre',
      normalConvention: 'OpenGL', ormChannels: 'R=AO,G=Roughness,B=Metallic',
      textureCompression: 'KTX2/BasisU', wiringStatus: 'isolated_candidate_no_promote',
      acceptanceClaim: false, deliverableRole: 'professional_hero_multi_lod',
      finalize: { tool: 'finalize_kestrel_borrowed_time_v3_candidate.mjs',
        meshopt: true, meshoptBufferViews: proof.meshopt,
        ktx2: true, ktx2Images: proof.ktx2, sourceTextureCount: sourceTextures },
    },
  };
}

function triangleCounts(doc) {
  const out = { lod0: 0, lod1: 0, lod2: 0 };
  for (const node of doc.nodes || []) {
    if (node.mesh == null) continue;
    const name = String(node.name || '').toLowerCase();
    const lod = name.includes('lod0') ? 'lod0' : name.includes('lod1') ? 'lod1' : name.includes('lod2') ? 'lod2' : null;
    if (!lod) continue;
    for (const primitive of doc.meshes?.[node.mesh]?.primitives || []) {
      const accessor = primitive.indices ?? primitive.attributes?.POSITION;
      out[lod] += Math.floor((doc.accessors?.[accessor]?.count || 0) / 3);
    }
  }
  return out;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
function server() {
  return new Promise((done) => {
    const instance = createServer((req, res) => {
      const path = resolve(ROOT, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, ''));
      if (!path.startsWith(ROOT) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(path));
    });
    instance.listen(0, '127.0.0.1', () => done({ instance, port: instance.address().port }));
  });
}

function previewHtml() {
  return `<!doctype html><style>html,body{margin:0;overflow:hidden;background:#080c12}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'; import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js'; import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const q=new URLSearchParams(location.search),mode=q.get('mode')||'close',w=+q.get('w'),h=+q.get('h');
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(w,h,false);r.setPixelRatio(1);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.12;document.body.append(r.domElement);
const s=new THREE.Scene();s.background=new THREE.Color(0x080c12);const c=new THREE.PerspectiveCamera(38,w/h,.05,1000);
s.add(new THREE.HemisphereLight(0xb9d7ea,0x121820,.72));const k=new THREE.DirectionalLight(0xffe7c9,1.65);k.position.set(20,18,-12);s.add(k);const f=new THREE.DirectionalLight(0x42b7ff,.75);f.position.set(-18,7,18);s.add(f);const rim=new THREE.DirectionalLight(0xffa452,.38);rim.position.set(-12,12,-18);s.add(rim);
const kt=new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(r);const l=new GLTFLoader().setKTX2Loader(kt).setMeshoptDecoder(MeshoptDecoder);
l.load('/${rel(CANDIDATE)}',g=>{const root=g.scene;root.traverse(o=>{if(o.isMesh&&/collision/i.test(o.name||''))o.visible=false});s.add(root);const b=new THREE.Box3().setFromObject(root),z=b.getSize(new THREE.Vector3()),ctr=b.getCenter(new THREE.Vector3()),m=Math.max(z.x,z.y,z.z);const mul=mode==='close'?.88:1.55,dist=m*mul;c.position.set(ctr.x+dist*.72,ctr.y+dist*.42,ctr.z-dist*.68);c.lookAt(ctr);c.near=Math.max(.05,dist/300);c.far=dist*20;c.updateProjectionMatrix();r.render(s,c);let meshes=0;root.traverse(o=>{if(o.isMesh&&o.visible)meshes++});window.__SF={ready:true,meshes,size:z.toArray()};},undefined,e=>window.__SF={ready:false,error:String(e)});
</script>`;
}

async function capture() {
  const { chromium } = await import('playwright');
  mkdirSync(THREE, { recursive: true }); mkdirSync(DEVSHOTS, { recursive: true });
  const html = resolve(EVIDENCE, 'three_preview_kestrel_v3.html'); writeFileSync(html, previewHtml());
  const { instance, port } = await server(); const browser = await chromium.launch({ headless: true }); const shots = [];
  try {
    for (const item of [
      ['close','close',960,540], ['mid','mid',512,512], ['120px','px120',120,120], ['under45px','far',40,40],
    ]) {
      const [name, mode, w, h] = item; const page = await browser.newPage({ viewport: { width:w,height:h } });
      await page.goto(`http://127.0.0.1:${port}/${rel(html)}?mode=${mode}&w=${w}&h=${h}`, { waitUntil:'networkidle' });
      await page.waitForFunction(() => window.__SF?.ready === true, null, { timeout:90000 });
      const meta = await page.evaluate(() => window.__SF); const target=resolve(THREE,`kestrel_v3_three_${name}.png`);
      await page.screenshot({path:target}); const dev=resolve(DEVSHOTS,`kestrel_v3_three_${name}.png`); copyFileSync(target,dev);
      shots.push({name,mode,w,h,path:rel(target),devshot:rel(dev),bytes:statSync(target).size,sha256:sha256(target),meta}); await page.close();
    }
  } finally { await browser.close(); instance.close(); }
  return shots;
}

async function main() {
  if (!existsSync(SOURCE)) throw new Error(`missing source ${SOURCE}`);
  mkdirSync(dirname(CANDIDATE), { recursive:true }); mkdirSync(EVIDENCE,{recursive:true});
  if (!process.argv.includes('--capture-only')) {
    await MeshoptEncoder.ready; await MeshoptDecoder.ready;
    const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
    const sourceRaw=raw(SOURCE); const doc=await io.read(SOURCE); splitTextureSlots(doc); ensureCollisionProxy(doc);
    await doc.transform(
      ktx2({slots:/^baseColorTexture$/,imageDecoder:decodeImage,isUASTC:true,uastcLDRQualityLevel:2,generateMipmap:true,needSupercompression:true,isPerceptual:true,isSetKTX2SRGBTransferFunc:true}),
      ktx2({slots:/^normalTexture$/,imageDecoder:decodeImage,isUASTC:true,uastcLDRQualityLevel:2,generateMipmap:true,needSupercompression:true,isNormalMap:true,isPerceptual:false,isSetKTX2SRGBTransferFunc:false}),
      ktx2({slots:/^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,imageDecoder:decodeImage,isUASTC:true,uastcLDRQualityLevel:2,generateMipmap:true,needSupercompression:true,isPerceptual:false,isSetKTX2SRGBTransferFunc:false}),
      meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14,quantizeNormal:10,quantizeTexcoord:12,quantizeColor:8,quantizeWeight:8,quantizeGeneric:12}),
    );
    stamp(doc,sourceRaw.textures||sourceRaw.images,{meshopt:0,ktx2:0}); await atomicWrite(io,doc,CANDIDATE);
    const first=raw(CANDIDATE); const doc2=await io.read(CANDIDATE); stamp(doc2,sourceRaw.textures||sourceRaw.images,{meshopt:first.meshopt,ktx2:first.ktx2}); await atomicWrite(io,doc2,CANDIDATE);
  }
  const proof=raw(CANDIDATE), lod=triangleCounts(proof.doc);
  const errors=[];
  if(!proof.extensions.includes('EXT_meshopt_compression')||proof.meshopt<1)errors.push('missing Meshopt');
  if(!proof.extensions.includes('KHR_texture_basisu')||proof.ktx2!==proof.images)errors.push(`KTX2 ${proof.ktx2}/${proof.images}`);
  for(const socket of REQUIRED_SOCKETS)if(!proof.nodes.includes(socket))errors.push(`missing ${socket}`);
  if(!proof.nodes.includes('COLLISION_HULL'))errors.push('missing COLLISION_HULL');
  if(!(lod.lod0>lod.lod1&&lod.lod1>lod.lod2&&lod.lod2>0))errors.push(`non-monotonic ${JSON.stringify(lod)}`);
  // Reject proxy exports, not focused hero geometry. The shipped Kestrel is
  // ~19k at LOD0; visible continuity and proof review carry the quality claim.
  if(lod.lod0<18000)errors.push(`LOD0 authored floor ${lod.lod0}`);
  if(statSync(CANDIDATE).size>=100*1024*1024)errors.push('candidate >=100MiB');
  const shots=errors.length?[]:await capture();
  const report={schema:'spaceface.kestrelBorrowedTimeV3Finalize.v1',packet:PACKET,candidateOnly:true,livePromotion:false,acceptanceClaim:false,ok:errors.length===0,errors,source:rel(SOURCE),candidate:rel(CANDIDATE),sourceBytes:statSync(SOURCE).size,candidateBytes:statSync(CANDIDATE).size,sourceSha256:sha256(SOURCE),candidateSha256:sha256(CANDIDATE),lod,materials:proof.materials,sockets:REQUIRED_SOCKETS,meshoptBufferViews:proof.meshopt,ktx2Images:proof.ktx2,imageCount:proof.images,shots};
  writeFileSync(resolve(EVIDENCE,'finalize_report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2)); if(errors.length)process.exitCode=1;
}
main().catch((error)=>{console.error(error);process.exit(1)});

