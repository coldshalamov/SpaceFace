import * as THREE from 'three';
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { occupantGenerationOf } from '../core/entity.js';

export const IRON_KRAKEN_DEBRIS_CAPACITY = 96;
export const IRON_KRAKEN_DEBRIS_PER_DEATH = 24;
export const IRON_KRAKEN_DEBRIS_MAX_LIFE = 4.8;
const HISTORY_CAPACITY = 512;
const TAU = Math.PI * 2;
const NON_DEATH_REASONS = new Set(['save_restore', 'reset', 'game_reset', 'new_game', 'sector_exit', 'sector_unload', 'unload', 'despawn']);
const FAMILY_NAMES = ['armor', 'joint', 'sucker', 'reactor', 'mantle'];
const EMPTY_OPTIONS = Object.freeze({});

/** The kill's lootTableId survives the entity's removal and the sliced presentation drain. */
export function ironKrakenDeathProfile(receipt, entity) {
  if (!receipt || typeof receipt !== 'object' || NON_DEATH_REASONS.has(receipt.reason)) return null;
  const identity = receipt.lootTableId || receipt.enemyTypeId;
  // An explicit non-Kraken identity cannot become a Kraken when its numeric id is recycled.
  return identity ? ironKrakenProfileFor(identity) : ironKrakenProfileFor(entity) || null;
}

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}
function noise(seed, index) {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

// These small, opaque constructions exist only in the death presenter. No internal rig, lights,
// gameplay bodies, textures, or hidden per-creature meshes are carried by the living Kraken.
function buildGeometry(family) {
  const positions = [], normals = [], colors = [];
  const color = new THREE.Color();
  const add = (geometry, tint, x = 0, y = 0, z = 0, rotationX = 0) => {
    geometry.rotateX(rotationX); geometry.translate(x, y, z);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    color.setHex(tint);
    const p = flat.getAttribute('position'), n = flat.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  };
  const cylinder = (top, bottom, height, tint, y = 0) => add(new THREE.CylinderGeometry(top, bottom, height, 10), tint, 0, y);
  if (family === 0) {
    // An open armored sleeve with beveled lips and its own dark lining, not a white cube.
    const profile = [[.75,-.6],[.9,-.51],[1,.36],[.91,.6],[.74,.6],[.81,.34],[.7,-.45],[.62,-.6],[.75,-.6]];
    add(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)), 10), 0xdedbd1);
    add(new THREE.TorusGeometry(.89,.045,4,10), 0x272a2e,0,-.5,0,Math.PI/2);
    add(new THREE.BoxGeometry(.2,.37,.055), 0xcc452d,0,.14,.95);
  } else if (family === 1) {
    cylinder(.62,.62,1.05,0x262b30);
    cylinder(.83,.83,.17,0x62696a,-.42);
    cylinder(.83,.83,.17,0x62696a,.42);
    add(new THREE.BoxGeometry(.42,.3,1.65),0x30353a);
  } else if (family === 2) {
    cylinder(.74,.6,.27,0x20252a);
    add(new THREE.TorusGeometry(.71,.12,5,12),0xb63b29,0,.18,0,Math.PI/2);
    cylinder(.24,.27,.12,0x454d50,.17);
  } else if (family === 3) {
    // Death-only pump section: ribbed core, red seals and two offset silver pistons.
    cylinder(.45,.52,1.35,0x252b30);
    for (let i=0;i<4;i++) cylinder(.64,.64,.09,0x596266,-.5+i*.33);
    cylinder(.57,.57,.12,0xbb422d,-.64);
    cylinder(.52,.52,.12,0xbb422d,.64);
    add(new THREE.CylinderGeometry(.12,.12,1.05,6),0x9b9e99,.72,0,.2);
    add(new THREE.CylinderGeometry(.12,.12,.76,6),0x9b9e99,-.63,-.15,-.1);
  } else {
    // A narrow section of pressure dome, not an enlarged arm sleeve. Outer enamel, dark inner
    // skin and closed thin edges share one geometry; no full creature or interior is built here.
    const profile = [[.94,-.62],[.92,-.39],[.83,-.12],[.65,.14],[.43,.36],[.20,.53],[.06,.60]];
    const steps = 6, last = profile.length-1, thickness = .035;
    const outer = [], inner = [], edges = [], inspection = [], warning = [];
    const point = (row,column,inset=0) => {
      const [radius,y] = profile[row], angle = -.36+column/steps*.72;
      return [(radius-inset)*Math.cos(angle),y,(radius-inset)*Math.sin(angle)];
    };
    const quad = (list,a,b,c,d) => list.push(...a,...b,...c,...a,...c,...d);
    const surface = (positions,tint) => {
      const shape = new THREE.BufferGeometry();
      shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      shape.computeVertexNormals(); add(shape,tint);
    };
    for (let row=0;row<last;row++) for (let column=0;column<steps;column++) {
      quad(outer,point(row,column),point(row+1,column),point(row+1,column+1),point(row,column+1));
      quad(inner,point(row,column,thickness),point(row,column+1,thickness),
        point(row+1,column+1,thickness),point(row+1,column,thickness));
    }
    for (let column=0;column<steps;column++) {
      quad(edges,point(0,column),point(0,column+1),point(0,column+1,thickness),point(0,column,thickness));
      quad(edges,point(last,column),point(last,column,thickness),point(last,column+1,thickness),point(last,column+1));
    }
    for (let row=0;row<last;row++) {
      quad(edges,point(row,0),point(row,0,thickness),point(row+1,0,thickness),point(row+1,0));
      quad(edges,point(row,steps),point(row+1,steps),point(row+1,steps,thickness),point(row,steps,thickness));
      if (row>=2 && row<5) quad(inspection,point(row,2.7,-.003),point(row+1,2.7,-.003),
        point(row+1,3.3,-.003),point(row,3.3,-.003));
    }
    quad(warning,point(1,1.4,-.004),point(2,1.4,-.004),point(2,2.2,-.004),point(1,2.2,-.004));
    surface(outer,0xdedbd1); surface(inner,0x272a2e); surface(edges,0x62696a);
    surface(inspection,0x272a2e); surface(warning,0xcc452d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  // snapshot() places its origin at the live petal's bounding-box center. Keep the shard's
  // matching local center at zero so the sampled world pose is preserved without an offset.
  if (family===4) geometry.center();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One bounded child of the existing VFX owner. Spawn inputs are global; instance matrices are
 * frame-local. options.frameOrigin is used only when a removed model needs the receipt fallback.
 * options.occupantGeneration carries the spawn owner's token when the corpse was removed before
 * the sliced presentation drain. The owner calls reproject(dx,dz) on its existing floating-origin
 * membrane. simTime owns aging.
 */
export function createIronKrakenDebris(scene) {
  if (!scene || typeof scene.add !== 'function') throw new TypeError('Kraken debris requires a scene');
  const group = new THREE.Group();
  group.name = 'sf-iron-kraken-debris'; group.visible = false;
  group.userData.vfxOwner = 'iron-kraken-debris';
  scene.add(group);
  const slots = Array.from({length:IRON_KRAKEN_DEBRIS_CAPACITY},()=>({
    active:false, family:0, born:0, motionAt:0, life:0, x:0,y:0,z:0,vx:0,vy:0,vz:0,
    qx:0,qy:0,qz:0,qw:1,sx:1,sy:1,sz:1,ax:0,ay:1,az:0,spin:0,
  }));
  const meshes = [], geometries = [], dimensions = [];
  let material = null, cursor = 0, active = 0, clock = null, disposed = false;
  let dirty = false, reducedMotion = false, reducedFlash = false;
  let deaths = 0, duplicateDeaths = 0, evicted = 0, snapshots = 0;
  const seen = new Set(), seenIds = new Map(), history = new Array(HISTORY_CAPACITY);
  let historyCursor = 0;
  let seenReceipts = new WeakSet();
  const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), axis = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), turn = new THREE.Quaternion(), sourceSize = new THREE.Vector3();
  const sourceCenter = new THREE.Vector3();

  function ensureMeshes() {
    if (material) return;
    material = new THREE.MeshStandardMaterial({ vertexColors:true, color:0xffffff,
      metalness:.36,roughness:.72,emissive:0x000000,emissiveIntensity:0 });
    for (let i=0;i<FAMILY_NAMES.length;i++) {
      const geometry = buildGeometry(i);
      geometries.push(geometry);
      dimensions.push(geometry.boundingBox.getSize(new THREE.Vector3()));
      const mesh = new THREE.InstancedMesh(geometry,material,IRON_KRAKEN_DEBRIS_CAPACITY);
      mesh.name = `sf-iron-kraken-debris-${FAMILY_NAMES[i]}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
      mesh.castShadow = false; mesh.receiveShadow = false;
      group.add(mesh); meshes.push(mesh);
    }
  }

  function clear() {
    for (let i=0;i<slots.length;i++) slots[i].active=false;
    for (let i=0;i<meshes.length;i++) { meshes[i].count=0; meshes[i].visible=false; }
    active=0; cursor=0; clock=null; dirty=false; group.visible=false;
    seen.clear(); seenIds.clear(); history.fill(undefined); historyCursor=0; seenReceipts=new WeakSet();
  }

  function publish(now) {
    for (let i=0;i<meshes.length;i++) meshes[i].count=0;
    for (let i=0;i<slots.length;i++) {
      const s=slots[i];
      if (!s.active) continue;
      const age=Math.max(0,now-s.born);
      if (age>=s.life) { s.active=false; active--; continue; }
      // Reduced motion holds a small separation without continuous tumble. Opaque, non-emissive
      // matter adds no flashes in either accessibility mode; existing explosion cues own the light.
      const elapsed=Math.max(0,now-s.motionAt);
      const motionAge=reducedMotion?Math.min(elapsed,.18)*.22:elapsed;
      const travel=(1-Math.exp(-.45*motionAge))/.45;
      position.set(s.x+s.vx*travel,s.y+s.vy*travel,s.z+s.vz*travel);
      quaternion.set(s.qx,s.qy,s.qz,s.qw);
      axis.set(s.ax,s.ay,s.az);
      turn.setFromAxisAngle(axis,s.spin*motionAge);
      quaternion.premultiply(turn);
      const retirement=Math.min(1,Math.max(0,(s.life-age)/.7));
      scale.set(s.sx*retirement,s.sy*retirement,s.sz*retirement);
      matrix.compose(position,quaternion,scale);
      const mesh=meshes[s.family];
      mesh.setMatrixAt(mesh.count++,matrix);
    }
    for (let i=0;i<meshes.length;i++) {
      const mesh=meshes[i]; mesh.visible=mesh.count>0;
      if (mesh.count>0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);
        mesh.instanceMatrix.needsUpdate=true;
      }
    }
    group.visible=active>0; dirty=false;
  }

  function update(simTime,options=EMPTY_OPTIONS) {
    if (disposed || !Number.isFinite(simTime)) return active;
    if (clock!==null && simTime<clock) clear();
    const nextReduced=!!options.reducedMotion;
    if (nextReduced!==reducedMotion) {
      // Settings can change while fragments are airborne. Re-anchor the last displayed pose
      // before changing its motion rule, rather than snapping the fragments back to their birth.
      const now=clock??simTime;
      for (let i=0;i<slots.length;i++) {
        const s=slots[i];if(!s.active)continue;
        const elapsed=Math.max(0,now-s.motionAt);
        const motionAge=reducedMotion?Math.min(elapsed,.18)*.22:elapsed;
        const travel=(1-Math.exp(-.45*motionAge))/.45;
        s.x+=s.vx*travel;s.y+=s.vy*travel;s.z+=s.vz*travel;
        quaternion.set(s.qx,s.qy,s.qz,s.qw);
        turn.setFromAxisAngle(axis.set(s.ax,s.ay,s.az),s.spin*motionAge);
        quaternion.premultiply(turn);
        s.qx=quaternion.x;s.qy=quaternion.y;s.qz=quaternion.z;s.qw=quaternion.w;
        s.motionAt=now;
      }
      dirty=true;
    }
    reducedMotion=nextReduced; reducedFlash=!!options.reducedFlash;
    if (active>0 && (dirty || simTime!==clock)) publish(simTime);
    clock=simTime;
    return active;
  }

  function snapshot(source,index,family) {
    if (!source?.isInstancedMesh || !(source.count>0)) return false;
    source.getMatrixAt(index%source.count,instance);
    matrix.multiplyMatrices(source.matrixWorld,instance);
    matrix.decompose(position,quaternion,scale);
    if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
    source.geometry.boundingBox.getSize(sourceSize);
    source.geometry.boundingBox.getCenter(sourceCenter);
    position.copy(sourceCenter).applyMatrix4(matrix);
    const targetSize=dimensions[family];
    scale.set(scale.x*sourceSize.x/targetSize.x,scale.y*sourceSize.y/targetSize.y,scale.z*sourceSize.z/targetSize.z);
    return Number.isFinite(position.x+position.y+position.z+scale.x+scale.y+scale.z)
      && scale.x>0 && scale.y>0 && scale.z>0;
  }

  function spawn(receipt,entity,mesh,simTime,options=EMPTY_OPTIONS) {
    const profile=ironKrakenDeathProfile(receipt,entity);
    const id=receipt?.id ?? entity?.id;
    const center=receipt?.pos || entity?.pos || receipt?.presentation?.position;
    if (disposed || !profile || id==null || !Number.isFinite(simTime)
      || !Number.isFinite(center?.x) || !Number.isFinite(center?.z)) return 0;
    update(simTime,options);
    const idKey=`${typeof id}:${String(id)}`;
    const generation=Object.hasOwn(options,'occupantGeneration')
      ? options.occupantGeneration : occupantGenerationOf(entity);
    const key=generation==null?idKey:`${idKey}:life:${typeof generation}:${String(generation)}`;
    const presentation=receipt.presentation;
    const hasPresentation=presentation && typeof presentation==='object';
    // Canonical ids recycle within a run. A new stamped occupant is a new death, while an
    // unstamped/removed fixture cannot claim a new lifetime merely by cloning the old receipt.
    if (seen.has(key) || (generation==null && seenIds.has(idKey)) || seenReceipts.has(receipt)
      || (hasPresentation && seenReceipts.has(presentation))) { duplicateDeaths++; return 0; }
    seenReceipts.add(receipt);
    if (hasPresentation) seenReceipts.add(presentation);
    const previous=history[historyCursor];
    if (previous!==undefined) {
      seen.delete(previous.key);
      const remaining=seenIds.get(previous.idKey)-1;
      if (remaining>0) seenIds.set(previous.idKey,remaining); else seenIds.delete(previous.idKey);
    }
    history[historyCursor]={key,idKey}; seen.add(key);
    seenIds.set(idKey,(seenIds.get(idKey)||0)+1); historyCursor=(historyCursor+1)%HISTORY_CAPACITY;
    ensureMeshes();
    const root=mesh || entity?.mesh || entity?.view?.root;
    const rig=root?.userData?.ironKrakenRig;
    if (rig) root.updateWorldMatrix(true,true);
    const seed=hash(`${key}:${profile.enemyId}`), r=profile.coreRadius;
    const origin=options.frameOrigin;
    const cx=center.x-finite(origin?.x),cz=center.z-finite(origin?.z);
    const velocity=receipt.presentation?.targetVelocity || entity?.vel || receipt.vel;
    const vx=finite(velocity?.x),vy=finite(velocity?.y),vz=finite(velocity?.z);
    const heading=finite(entity?.rot,finite(receipt.rot));
    for (let i=0;i<IRON_KRAKEN_DEBRIS_PER_DEATH;i++) {
      const s=slots[cursor]; cursor=(cursor+1)%slots.length;
      if (s.active) evicted++; else active++;
      const family=i<4?4:i<12?0:i<16?1:i<20?2:3;
      const angle=heading+(i%8)*TAU/8+noise(seed,i)*.24;
      let captured=false;
      if (rig && family!==3) {
        const source=i<4?rig.shell:family===0?rig.armor:family===1?rig.joints:rig.suckers;
        const index=i<4?i*2:(i%8)*22+3+(i*3)%12;
        captured=snapshot(source,index,family);
      }
      if (!captured) {
        const distance=family===3?r*.28:r*(i<4?.72:1.05+noise(seed,i+26)*1.2);
        position.set(cx+Math.cos(angle)*distance,r*(family===3?.18:.12+noise(seed,i+31)*.2),cz+Math.sin(angle)*distance);
        quaternion.setFromAxisAngle(axis.set(0,1,0),family===4?-angle:angle);
        const size=r*(family===3?.14:family===2?.10:i<4?.34:.15)*(1+noise(seed,i+52)*.25);
        scale.setScalar(size);
      } else snapshots++;
      s.active=true; s.family=family; s.born=simTime; s.motionAt=simTime;
      s.life=3.2+noise(seed,i+74)*(IRON_KRAKEN_DEBRIS_MAX_LIFE-3.2);
      s.x=position.x; s.y=position.y; s.z=position.z;
      s.qx=quaternion.x; s.qy=quaternion.y; s.qz=quaternion.z; s.qw=quaternion.w;
      s.sx=scale.x; s.sy=scale.y; s.sz=scale.z;
      const outward=angle+noise(seed,i+103)*.42;
      const speed=r*(.45+noise(seed,i+125)*.65);
      s.vx=Math.cos(outward)*speed+vx*.6; s.vy=(noise(seed,i+147)-.3)*r*.45+vy*.6;
      s.vz=Math.sin(outward)*speed+vz*.6;
      axis.set(noise(seed,i+168)-.5,noise(seed,i+189)-.5,noise(seed,i+210)-.5).normalize();
      s.ax=axis.x; s.ay=axis.y; s.az=axis.z; s.spin=(noise(seed,i+232)-.5)*3.2;
    }
    deaths++; dirty=true; publish(simTime);
    return IRON_KRAKEN_DEBRIS_PER_DEATH;
  }

  function reproject(dx,dz) {
    if (disposed || active===0 || !Number.isFinite(dx) || !Number.isFinite(dz) || (dx===0&&dz===0)) return;
    for (let i=0;i<slots.length;i++) if (slots[i].active) { slots[i].x+=dx; slots[i].z+=dz; }
    dirty=true; publish(clock??0);
  }

  function dispose() {
    if (disposed) return;
    clear(); disposed=true; group.removeFromParent();
    for (let i=0;i<meshes.length;i++) meshes[i].dispose();
    for (let i=0;i<geometries.length;i++) geometries[i].dispose();
    material?.dispose(); group.clear();
  }

  function diagnostics() {
    return {schema:'spaceface.iron-kraken-debris.v1',active,capacity:IRON_KRAKEN_DEBRIS_CAPACITY,
      perDeath:IRON_KRAKEN_DEBRIS_PER_DEATH,maxLife:IRON_KRAKEN_DEBRIS_MAX_LIFE,
      deaths,duplicateDeaths,evicted,snapshots,historySize:seen.size,historyCapacity:HISTORY_CAPACITY,
      drawCalls:meshes.reduce((n,m)=>n+(m.visible?1:0),0),initialized:!!material,
      reducedMotion,reducedFlash,disposed,clock};
  }
  return {group,spawn,update,reproject,clear,dispose,diagnostics};
}
