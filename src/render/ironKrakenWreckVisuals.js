// The aftermath owner already persists the victim's hulkVisual identity. Keep that identity on
// the successor body without building another living rig, attack controller or hidden interior.
import * as THREE from 'three';
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { getIronKrakenVisualResources } from './ironKrakenVisuals.js';
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
  for (const [name, multiplier] of [['shell', .58], ['dark', .82], ['red', .45]]) {
    const m = new THREE.MeshStandardMaterial({ color:live[name].color.clone().multiplyScalar(multiplier),
      roughness:.88, metalness:.24, emissive:0x000000, emissiveIntensity:0 });
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
  mesh(g.hullRed, m.red, 'burnt_optic_rims');
  mesh(g.lens, m.dark, 'unlit_camera_lenses');
  const shell = instances(g.shell,m.shell,5,'torn_mantle_petals');
  const shellDetail = instances(g.shellDetail,m.dark,5,'torn_mantle_inner_edges');
  const shellAccent = instances(g.shellAccent,m.red,5,'burnt_mantle_markings');
  const armor = instances(g.armor,m.shell,IRON_KRAKEN_WRECK_LINKS,'broken_arm_armor');
  const joints = instances(g.joint,m.dark,IRON_KRAKEN_WRECK_LINKS,'broken_arm_joints');
  const suckers = instances(g.sucker,m.red,IRON_KRAKEN_WRECK_LINKS,'dead_suction_rims');
  const cups = instances(g.suckerCore,m.dark,IRON_KRAKEN_WRECK_LINKS,'dead_suction_cups');
  const jaws = instances(g.beak,m.dark,2,'slack_siphon_jaws');
  const matrix = new THREE.Matrix4(), basis = new THREE.Matrix4();
  const q = new THREE.Quaternion(), yaw = new THREE.Quaternion(), hinge = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0,1,0), zAxis = new THREE.Vector3(0,0,1);
  const write = (part,index,x,y,z,sx,sy,sz) => {
    matrix.compose(position.set(x,y,z),q,scale.set(sx,sy,sz)); part.setMatrixAt(index,matrix);
  };
  // Both detachable side plates are gone. Unevenly splayed surviving petals and a third missing
  // panel open the silhouette; there is no intact second shell or permanently buried engine.
  for (const [index, petal] of [0,1,3,4,7].entries()) {
    const a = petal * TAU / 8;
    q.copy(yaw.setFromAxisAngle(yAxis,-a)).multiply(hinge.setFromAxisAngle(zAxis,-.20-.10*(petal%3)));
    for (const part of [shell,shellDetail,shellAccent]) write(part,index,Math.cos(a)*.86,.32,Math.sin(a)*.86,1,1,1);
  }
  const armLength = (profile.armReach/profile.coreRadius-.85)*.76;
  let index = 0;
  for (let arm=0;arm<8;arm++) {
    const a = arm*TAU/8+Math.PI/8, ca = Math.cos(a), sa = Math.sin(a);
    const plane = .48*Math.sin(arm*1.71), up = Math.sqrt(1-plane*plane);
    const vx = -sa*plane, vz = ca*plane, links = arm%2===0?18:4;
    let x = ca*.87, y = -.39, z = sa*.87;
    for (let link=0;link<links;link++,index++) {
      const s = (link+.5)/18, bend = -.20-.38*Math.sin(Math.PI*s)+5.8*s*s*s*s;
      tangent.set(ca*Math.cos(bend)+vx*Math.sin(bend),up*Math.sin(bend),sa*Math.cos(bend)+vz*Math.sin(bend)).normalize();
      binormal.set(-sa*up,-plane,ca*up).normalize();
      binormal.addScaledVector(tangent,-binormal.dot(tangent)).normalize();
      normal.crossVectors(binormal,tangent).normalize();
      q.setFromRotationMatrix(basis.makeBasis(binormal,tangent,normal));
      const length = armLength*(1.32-.64*s)/18, radius = .15*Math.pow(1-s,.92)+.022;
      const nx = x+tangent.x*length, ny = y+tangent.y*length, nz = z+tangent.z*length;
      const cx = (x+nx)*.5, cy = (y+ny)*.5, cz = (z+nz)*.5, cup = radius*.8;
      write(armor,index,cx,cy,cz,radius,length*.72,radius);
      write(joints,index,x,y,z,radius*.73,radius*.73,radius*.73);
      for (const part of [suckers,cups]) write(part,index,cx-normal.x*radius*.94,cy-normal.y*radius*.94,
        cz-normal.z*radius*.94,cup,cup,cup);
      x=nx; y=ny; z=nz;
    }
  }
  q.setFromAxisAngle(zAxis,-.18); write(jaws,0,.12,-.70,-.09,1,1,1);
  q.setFromAxisAngle(yAxis,Math.PI); write(jaws,1,.12,-.70,.09,1,1,1);
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
    authoredVisualRoot:'iron-kraken-static-wreck', generatedVisualProducer:'iron-kraken-wreck-v1',
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
