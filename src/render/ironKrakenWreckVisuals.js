// The aftermath owner already persists the victim's hulkVisual identity. Keep that identity on
// the successor body without building another living rig, attack controller or hidden interior.
import * as THREE from 'three';
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { getIronKrakenVisualResources, getIronKrakenDistantArmResources } from './ironKrakenVisuals.js';
import { IRON_KRAKEN_MANTLE_HINGE } from './ironKrakenHullGeometry.js';
import { IRON_KRAKEN_ARM_MOTION, ironKrakenArmRadius, sampleIronKrakenArm } from './ironKrakenMotion.js';
import { installIllustratedSurface } from './illustratedSurface.js';

export const IRON_KRAKEN_WRECK_LINKS = 88; // four 18-link curled arms, four four-link broken roots
const TAU = Math.PI * 2;
let wreckMaterials = null;

export function ironKrakenWreckProfileFor(entity) {
  const data = entity?.data;
  if (entity?.type !== 'wreck' || !data?.hulkVisual || data.fracturePiece
    || data.collisionTearOff || data.arenaShardOf || data.fractureVisual?.partId) return null;
  return ironKrakenProfileFor(data.hulkVisual.lootTableId || data.hulkVisual.enemyTypeId);
}

function palette(live) {
  if (wreckMaterials) return wreckMaterials;
  wreckMaterials = {};
  for (const [name, multiplier] of [['shell', .58], ['dark', .82], ['red', .45], ['metal', .67]]) {
    const m = new THREE.MeshStandardMaterial({ color:live[name].color.clone().multiplyScalar(multiplier),
      roughness:name==='metal'?.73:.88, metalness:name==='metal'?.58:.24,
      emissive:0x000000, emissiveIntensity:0 });
    m.name = `IronKrakenWreck_${name}`;
    m.userData.spacefaceSharedAsset = true;
    m.userData.spacefaceFinish = 'forge-v1';
    installIllustratedSurface(m);
    wreckMaterials[name] = m;
  }
  return wreckMaterials;
}

/** Static recognizable corpse; world position, bank and inherited tumble stay renderer-owned. */
export function createIronKrakenWreckVisual(entity) {
  const profile = ironKrakenWreckProfileFor(entity);
  if (!profile) throw new Error('Iron Kraken wreck requires an intact hulkVisual identity');
  const { geometries:g, materials:live } = getIronKrakenVisualResources(), m = palette(live);
  // Persistent corpses share the living asset's reduced-detail arm buffers. Every structural
  // link, cup and hydraulic rod remains; subpixel stripes/fasteners need no instance allocation.
  const armGeometry = getIronKrakenDistantArmResources();
  const root = new THREE.Group(), body = new THREE.Group(), batches = [];
  root.name = `IronKrakenWreck_${profile.variant}`;
  body.name = 'dead_pressure_body'; body.scale.setScalar(profile.coreRadius);
  body.rotation.set(.12, 0, -.20); root.add(body);
  const mesh = (geometry, material, name) => {
    const part = new THREE.Mesh(geometry, material); part.name = name;
    part.castShadow = part.receiveShadow = true; body.add(part); return part;
  };
  const instances = (geometry, material, count, name) => {
    const part = new THREE.InstancedMesh(geometry, material, count); part.name = name;
    part.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    part.castShadow = part.receiveShadow = true; body.add(part); batches.push(part); return part;
  };
  mesh(g.hull, m.shell, 'scorched_pressure_hull');
  mesh(g.hullDark, m.dark, 'dead_collar_and_arm_sockets');
  mesh(g.hullMetal, m.metal, 'damaged_root_actuator_clamps');
  mesh(g.hullRed, m.red, 'burnt_root_warning_seals');
  mesh(g.wreckEyeDark, m.dark, 'dead_optical_barrels');
  mesh(g.wreckEyeMetal, m.dark, 'dead_optical_iris_mechanisms');
  mesh(g.wreckEyeOrange, m.red, 'burnt_optic_rims');
  mesh(g.lens, m.dark, 'unlit_camera_lenses');
  const shell = instances(g.shell,m.shell,5,'torn_mantle_petals');
  const shellDetail = instances(g.shellDetail,m.dark,5,'torn_mantle_inner_edges');
  const shellAccent = instances(g.shellAccent,m.red,5,'burnt_mantle_markings');
  const shellMetal = instances(g.shellMetal,m.metal,5,'broken_viewport_jambs_and_actuators');
  const armor = instances(armGeometry.armor,m.shell,IRON_KRAKEN_WRECK_LINKS,'broken_arm_armor');
  const joints = instances(armGeometry.joint,m.dark,IRON_KRAKEN_WRECK_LINKS,'broken_arm_joints');
  const hardware = instances(armGeometry.hardware,m.dark,IRON_KRAKEN_WRECK_LINKS,'broken_arm_service_panels');
  const jointMetal = instances(armGeometry.jointMetal,m.metal,IRON_KRAKEN_WRECK_LINKS,'exposed_dead_piston_rods');
  const jointRed = instances(armGeometry.jointRed,m.red,IRON_KRAKEN_WRECK_LINKS,'burnt_gimbal_axis_caps');
  const suckers = instances(armGeometry.sucker,m.red,IRON_KRAKEN_WRECK_LINKS,'dead_suction_rims');
  const cups = instances(armGeometry.suckerCore,m.dark,IRON_KRAKEN_WRECK_LINKS,'dead_suction_cups');
  const jaws = instances(g.beak,m.dark,2,'slack_siphon_jaws');
  const jawMarks = instances(g.beakRed,m.red,2,'burnt_siphon_safety_marks');
  const jawMetal = instances(g.beakMetal,m.metal,2,'split_siphon_seals');
  const armorMeshes = [armor,hardware];
  const jointMeshes = [joints,jointMetal,jointRed];
  const cupMeshes = [suckers,cups];
  const matrix = new THREE.Matrix4(), basis = new THREE.Matrix4();
  const q = new THREE.Quaternion(), yaw = new THREE.Quaternion(), hinge = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0,1,0), zAxis = new THREE.Vector3(0,0,1);
  const cupFlip = new THREE.Quaternion().setFromAxisAngle(yAxis,Math.PI);
  const write = (part,index,x,y,z,sx,sy,sz) => {
    matrix.compose(position.set(x,y,z),q,scale.set(sx,sy,sz)); part.setMatrixAt(index,matrix);
  };
  // Both detachable side plates are gone. Unevenly splayed surviving petals and a third missing
  // panel open the silhouette. Inspection panes and the crown have blown out: retain their
  // mechanical jambs, but allocate neither transparent glass nor a permanently buried engine.
  for (const [index, petal] of [0,1,3,4,7].entries()) {
    const a = petal * TAU / 8;
    q.copy(yaw.setFromAxisAngle(yAxis,-a)).multiply(hinge.setFromAxisAngle(zAxis,-.20-.10*(petal%3)));
    for (const part of [shell,shellDetail,shellAccent,shellMetal]) write(part,index,
      Math.cos(a)*IRON_KRAKEN_MANTLE_HINGE.radius,IRON_KRAKEN_MANTLE_HINGE.height,
      Math.sin(a)*IRON_KRAKEN_MANTLE_HINGE.radius,1,1,1);
  }
  // Sample the same manufactured chain once, then discard the buffers. Surviving chains retain
  // their terminal coil with 18 physical links at the live link pitch; four others end at the
  // fourth proximal mechanism. Preserve the four large shoulder pitches exactly; shorten only
  // the fine tail about the elbow so losing four links cannot shrink the live macro anatomy.
  const liveLinks = IRON_KRAKEN_ARM_MOTION.links;
  const proximalLinks = IRON_KRAKEN_ARM_MOTION.proximalLinks;
  const points = new Float32Array((liveLinks+1)*3), frames = new Float32Array(liveLinks*9);
  const deadPose = {time:0,reducedMotion:true};
  let index = 0;
  for (let arm=0;arm<8;arm++) {
    const survives = arm%2===0, links = survives?18:4, sampledLinks = survives?18:liveLinks;
    sampleIronKrakenArm(arm,deadPose,points,0,frames,0,sampledLinks);
    if(survives) {
      const shorten=(sampledLinks-proximalLinks)/(liveLinks-proximalLinks),elbow=proximalLinks*3;
      const ex=points[elbow],ey=points[elbow+1],ez=points[elbow+2];
      for(let point=elbow+3;point<=(sampledLinks*3);point+=3) {
        points[point]=ex+(points[point]-ex)*shorten;
        points[point+1]=ey+(points[point+1]-ey)*shorten;
        points[point+2]=ez+(points[point+2]-ez)*shorten;
      }
    }
    for (let link=0;link<links;link++,index++) {
      const point=link*3,next=point+3,frame=link*9;
      const x=points[point],y=points[point+1],z=points[point+2];
      const nx=points[next],ny=points[next+1],nz=points[next+2];
      binormal.fromArray(frames,frame);tangent.fromArray(frames,frame+3);normal.fromArray(frames,frame+6);
      q.setFromRotationMatrix(basis.makeBasis(binormal,tangent,normal));
      const length = Math.hypot(nx-x,ny-y,nz-z), radius = ironKrakenArmRadius(link,sampledLinks);
      const cx = (x+nx)*.5, cy = (y+ny)*.5, cz = (z+nz)*.5, cup = radius*.8;
      const proximal = link<proximalLinks, sleeveLength=length*(proximal?.64:.80);
      const jointLength=proximal?length*.40:radius*.73;
      for (const part of armorMeshes) write(part,index,cx,cy,cz,radius,sleeveLength,radius);
      for (const part of jointMeshes) write(part,index,x,y,z,radius*.73,jointLength,radius*.73);
      q.multiply(cupFlip);
      for (const part of cupMeshes) write(part,index,cx-normal.x*radius*.94,cy-normal.y*radius*.94,
        cz-normal.z*radius*.94,cup,cup,cup);
    }
  }
  q.setFromAxisAngle(zAxis,-.18);
  for(const part of [jaws,jawMarks,jawMetal]) write(part,0,.04,-.83,0,1,1,1);
  q.setFromAxisAngle(yAxis,Math.PI);
  for(const part of [jaws,jawMarks,jawMetal]) write(part,1,0,-.79,0,1,1,1);
  for (const part of batches) {
    part.instanceMatrix.needsUpdate = true; part.computeBoundingBox(); part.computeBoundingSphere();
  }
  // Pay the finite envelope walk once at construction. No pose buffer, motion callback, clock,
  // private material, scene search or per-frame instance update survives on the wreck.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.traverse(part => { if (part!==root) { part.updateMatrix(); part.matrixAutoUpdate=false; } });
  Object.assign(root.userData, { kind:'wreck', animated:false, authoredAssetState:'authored',
    authoredVisualRoot:'iron-kraken-static-wreck', generatedVisualProducer:'iron-kraken-wreck-v2',
    visualLanguage:'scorched_pressure_hull_curled_arms_broken_roots',
    visualBounds:{center:center.toArray(),size:size.toArray()},
    ironKrakenWreck:{enemyId:profile.enemyId,variant:profile.variant,links:index,survivingArms:4,brokenRoots:4} });
  let disposed = false;
  // Both the live renderer and partsLibrary's detached/stepped teardown call this hook. The
  // latter does not itself dispose instance buffers. It is cleanup only, never an update lane.
  root.userData.detachAuthoredMotion = () => {
    if (disposed) return; disposed = true;
    for (const part of batches) part.dispose();
  };
  root.userData.disposeIronKrakenWreck = () => {
    root.userData.detachAuthoredMotion();
    root.removeFromParent();
  };
  return root;
}
