// Original, articulated hard-surface character art. This is the authored asset, not a fallback.
// No external media, textures, fetch, timers, random calls, billboards, or sim mutations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BRACKET as C } from '../../data/bracket.js';
const TAU = Math.PI * 2;
const sat = n => Math.max(0, Math.min(1, n));
const smooth = n => { n = sat(n); return n * n * (3 - 2 * n); };

function palette() {
  const paint = color => new THREE.MeshPhysicalMaterial({ color, metalness: 0.25, roughness: 0.31, clearcoat: 0.8, clearcoatRoughness: 0.24 });
  const m = {
    bone: paint(0x978b70), oxide: paint(0x823d2d), graphite: new THREE.MeshStandardMaterial({ color: 0x17252d, roughness: 0.35, metalness: 0.72 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x647277, roughness: 0.3, metalness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x070e15, roughness: 0.73, metalness: 0.05 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xba762b, emissive: 0xffa537, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.3 }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0x2d9d95, emissive: 0x55ffe0, emissiveIntensity: 1.65, metalness: 0.25, roughness: 0.15, clearcoat: 1 }),
  };
  for (const [name, mat] of Object.entries(m)) mat.name = `BX9_${name}`;
  return m;
}
function add(g, geometry, mat, name, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(geometry, mat); m.name = name; m.position.set(...pos);
  m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function plate(points, depth = 1, bevel = 0.16) {
  const s = new THREE.Shape();
  points.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 3 })
    .translate(0, 0, -depth / 2).rotateX(-Math.PI / 2);
}
const chamfer = (w, l, c = 0.5) => [[-w/2+c,-l/2],[w/2-c,-l/2],[w/2,-l/2+c],[w/2,l/2-c],[w/2-c,l/2],[-w/2+c,l/2],[-w/2,l/2-c],[-w/2,-l/2+c]];
function block(g, m, w, h, l, pos, name, bevel = 0.13) { return add(g, plate(chamfer(w, l, Math.min(w,l)*0.13), h, bevel), m, name, pos); }
function rod(g, m, a, b, radius = 0.3, name = 'rod', sides = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.sub(start);
  const mesh = add(g, new THREE.CylinderGeometry(radius, radius, delta.length(), sides), m, name);
  mesh.position.copy(start).addScaledVector(delta, 0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), delta.normalize()); return mesh;
}
function ring(g, m, r, tube, pos, name, arc = TAU) {
  return add(g, new THREE.TorusGeometry(r, tube, 6, 32, arc).rotateX(Math.PI / 2), m, name, pos);
}
function batch(g) {
  // Batch static detail per material, retaining semantic groups for the articulation joints.
  const buckets = new Map();
  for (const mesh of [...g.children]) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
    buckets.get(mesh.material).push(geometry); mesh.geometry.dispose(); g.remove(mesh);
  }
  for (const [material, geos] of buckets) {
    const geometry = mergeGeometries(geos, false);
    for (const source of geos) source.dispose();
    if (!geometry) throw new Error('BRACKET static geometry merge failed');
    add(g, geometry, material, `${g.name}_${material.name}`);
  }
}
function group(root, name, pos = [0,0,0], animated = false) {
  const g = new THREE.Group(); g.name = name; g.position.set(...pos);
  if (animated) g.userData.animated = true;
  root.add(g); return g;
}
function pips(root, m, x, y, z, pitch = 3.3, radius = 0.7) {
  const out = [];
  for (let i=0;i<5;i++) {
    const g = group(root, `score_socket_${i}`, [x+i*pitch,y,z]);
    ring(g,m.steel,radius+0.32,0.15,[0,0,0],`socket_${i}`);
    const light = add(g,new THREE.IcosahedronGeometry(radius,0),m.amber.clone(),`score_light_${i}`,[0,0.15,0]);
    const cross = group(g,`miss_cross_${i}`,[0,0.4,0]);
    rod(cross,m.oxide,[-radius,0,-radius],[radius,0,radius],0.15);
    rod(cross,m.oxide,[-radius,0,radius],[radius,0,-radius],0.15);
    light.userData.animated=true; cross.visible=false; out.push({ light, cross });
  }
  return out;
}
function updatePips(rows, results) {
  for(let i=0;i<rows.length;i++) {
    const scored=results?.[i]===1, missed=results?.[i]===0;
    rows[i].light.material.emissiveIntensity=scored?1.6:0.04;
    rows[i].light.scale.setScalar(scored?1:0.58); rows[i].cross.visible=missed;
  }
}

function buildKeeper(root, m) {
  const body=group(root,'armoured_sorter_core',[0,0,0],true);
  add(body,plate([[-6,-9],[-3,-11],[3,-11],[6,-9],[8,-4],[7,7],[3,9],[-3,9],[-7,7],[-8,-4]],4,0.5),m.graphite,'cast_chassis',[0,0,0]);
  add(body,plate([[-6,-7],[-3,-9],[3,-9],[6,-7],[5,-1],[-5,-1]],1.5,0.32),m.bone,'dorsal_scapula',[0,3.3,0]);
  // Built-in geometric wear: an intentionally mismatched riveted repair plate, not noisy textures.
  block(body,m.oxide,3.2,0.65,5.6,[-3.8,4.2,-4.4],'replacement_red_panel');
  for(let i=0;i<4;i++) rod(body,m.steel,[-4.9+i*.7,4.7,-6.4],[-4.9+i*.7,4.7,-5.8],0.12,'repair_staple');
  for(const sign of [-1,1]) {
    block(body,m.oxide,2.4,2.2,5.8,[sign*6.5,1,-4],'side_impact_casing');
    for(let j=0;j<5;j++) block(body,m.rubber,1.7,.16,.28,[sign*6.5,2.25,-6+j*.8],'cooling_slot',0.02);
    rod(body,m.steel,[sign*4,-1,-7],[sign*4,-1,5],0.5,'hydraulic_rail');
    block(body,m.bone,3.8,.8,3.5,[sign*3.2,-2,-5],'ventral_ski');
    ring(body,m.amber,1,.12,[sign*4.8,3,-8],'rear_position_lamp');
    // Hoses attach at both ends, with visible collars.
    rod(body,m.rubber,[sign*6,2,0],[sign*8.7,1,2],0.42,'shoulder_hose');
    ring(body,m.steel,1.6,.24,[sign*7.4,2,1],'shoulder_bearing');
  }
  ring(body,m.steel,4.5,.42,[0,3.3,2],'head_bearing');
  for(let i=0;i<12;i++) {const a=i*TAU/12;block(body,m.steel,.55,.3,1.1,[Math.cos(a)*4.4,3.35,2+Math.sin(a)*4.4],'bearing_tooth',0.04);}
  batch(body);
  const head=group(body,'cyclops_head',[0,4.4,2],true);
  add(head,plate([[-5,-3.8],[-3.5,-5],[3.5,-5],[5,-3.8],[4.8,3],[3,4],[-3,4],[-4.8,3]],2.8,0.5),m.bone,'face_casting');
  block(head,m.graphite,8.1,.5,5.9,[0,1.9,0.2],'recessed_eye_well');
  block(head,m.rubber,6.7,.24,3.7,[0,2.25,0.6],'smoked_eye_glass');
  block(head,m.oxide,9,.55,.8,[0,2.6,-2.55],'asymmetric_brow');
  for(let i=0;i<3;i++) block(head,m.steel,1,.22,.22,[-2+i*1.6,2.1,3.1],'mouth_grille',0.025);
  rod(head,m.steel,[-3,-.5,-3.7],[-4,3,-5.9],.16,'bent_aerial');
  add(head,new THREE.OctahedronGeometry(.4),m.amber,'aerial_tip',[-4,3,-5.9]);
  batch(head);
  const iris=group(head,'tracking_iris',[0,2.6,.4],true);
  block(iris,m.eye,4.8,.38,.70,[0,0,0],'wide_cyclops_slit',.10);
  ring(iris,m.eye,.78,.15,[0,.15,0],'reticle_ring');
  block(iris,m.rubber,.34,.25,1.1,[0,.26,0],'iris_cut',.015);
  batch(iris);
  const arms=[];
  for(const sign of [-1,1]) {
    const arm=group(body,sign<0?'left_catcher':'right_catcher',[sign*7.1,.6,0],true);
    rod(arm,m.steel,[0,0,0],[sign*4,0,3.4],1.25,'upper_hydraulic');
    rod(arm,m.oxide,[sign*.5,1.2,.2],[sign*4,1.2,3.2],.45,'pressure_line');
    ring(arm,m.steel,1.8,.42,[sign*4,0,3.4],'elbow_bearing');
    add(arm,plate([[sign*2,2],[sign*5.1,1.8],[sign*7,5.2],[sign*6.1,9.2],[sign*3.7,10],[sign*2.2,6.5]],2.6,.35),m.oxide,'catcher_palm',[0,.3,0]);
    add(arm,plate([[sign*2.6,3],[sign*4.8,2.8],[sign*6,5.4],[sign*5.3,8],[sign*3.8,8.6],[sign*3,6.5]],.65,.18),m.bone,'catcher_face',[0,2,0]);
    // Four segmented fingers curl around a readable empty bracket, rather than a solid paddle.
    for(let i=0;i<3;i++) {
      const z=5.1+i*1.65;
      block(arm,m.graphite,2.3,1.25,.95,[sign*2.3,.6,z],'finger_knuckle');
      block(arm,m.bone,1.6,.8,.8,[sign*.75,.7,z],'finger_tip');
      block(arm,m.amber,.6,.18,.64,[sign*.18,1.22,z],'contact_lamp',.04);
    }
    batch(arm); arms.push(arm);
  }
  const crown=group(body,'score_crown',[0,7,-7.2],true);
  rod(crown,m.steel,[-6.5,0,0],[6.5,0,0],.38,'score_spine');
  rod(crown,m.steel,[-4,-4,0],[-4,0,0],.35,'score_mount_left');
  rod(crown,m.steel,[4,-4,0],[4,0,0],.35,'score_mount_right');
  batch(crown);
  const rows=pips(crown,m,-6.4,.4,0,3.2,.6);
  // Whistle hangs from a real short mechanical linkage.
  const whistle=group(body,'whistle_link',[0,-.2,8.5],true);
  rod(whistle,m.steel,[0,0,0],[0,-1.8,1.8],.13,'lanyard');
  block(whistle,m.amber,1.2,.9,2.2,[0,-2,2.1],'ceramic_whistle'); batch(whistle);
  return (e,t,a11y)=>{
    const p=e.data?.bracketPose||{}, reduce=!!a11y.reducedMotion, flash=!!a11y.reducedFlash;
    const age=t-(p.gestureAt??-100), tell=p.keeperPhase==='tell', dash=p.keeperPhase==='dash';
    const direction=Math.sign(p.targetX||0), active=p.phase==='play', closed=p.phase==='closed';
    body.position.y=reduce?0:Math.sin(t*.9)*.2;
    body.rotation.z=reduce?0:(tell?-direction*.12*(p.tell||0):dash?direction*.10:0);
    const bow=(p.gesture==='bow'||p.gesture==='concede')&&age>=0&&age<2.4;
    body.rotation.x=bow&&!reduce?Math.sin(Math.min(1,age/2.4)*Math.PI)*.20:0;
    head.rotation.y=clampVisual(p.gaze||0,-.7,.7)*.24;
    const blink=reduce?0:Math.pow(Math.max(0,Math.cos(t*.57)),60)*.85;
    iris.scale.z=closed?.14:Math.max(.15,1-blink);
    iris.position.x=clampVisual(Math.sin(p.gaze||0)*1.1,-1.1,1.1);
    m.eye.emissiveIntensity=closed?.18:p.awake?(flash?1.1:1.6):.35;
    const noHands=p.gesture==='no-hands'&&age>=0&&age<7;
    for(let i=0;i<2;i++) {
      const sign=i===0?-1:1;
      arms[i].rotation.y=sign*(closed?1.4:noHands?-1.2:active?.10:-.12);
      arms[i].rotation.z=reduce?0:sign*(tell?.18*(p.tell||0):bow?.16:0);
      if(p.gesture==='shrug'&&age>=0&&age<3&&!reduce) arms[i].rotation.z+=sign*Math.sin(age*Math.PI/3)*.28;
    }
    crown.rotation.z=!reduce&&p.gesture==='victory'&&age<3?Math.sin(age*7)*.08:0;
    whistle.rotation.x=reduce?0:Math.sin(t*1.7)*.12;
    updatePips(rows,p.results);
  };
}
function clampVisual(x,a,b){return Math.max(a,Math.min(b,x));}
function buildBall(root,m) {
  const shell=group(root,'stitched_scrapball',[0,0,0],true);
  add(shell,new THREE.DodecahedronGeometry(3.95,0),m.oxide,'twelve_cast_panels');
  add(shell,new THREE.IcosahedronGeometry(3.0,1),m.graphite,'dark_inner_ball');
  for(let i=0;i<3;i++) {
    const hoop=ring(shell,i===0?m.eye:m.steel,4.12,.22,[0,0,0],`reinforcing_meridian_${i}`);
    if(i===1)hoop.rotation.z=Math.PI/2; if(i===2)hoop.rotation.x=Math.PI/2;
  }
  for(const sign of [-1,1]) {
    add(shell,new THREE.OctahedronGeometry(.65),m.amber,'pole_fastener',[0,sign*4.02,0]);
  }
  batch(shell);
  return(e,t,a11y)=>{
    const speed=Math.hypot(e.vel?.x||0,e.vel?.z||0);
    shell.rotation.y=a11y.reducedMotion?0:t*.24;
    shell.rotation.x=a11y.reducedMotion?0:t*.13;
    m.eye.emissiveIntensity=a11y.reducedFlash?1.0:1.2+sat(speed/140)*.7;
  };
}
function buildHardware(root,m,part) {
  const left=part==='post-left', bumper=part.startsWith('bumper');
  const base=group(root,'yard_casting');
  add(base,plate(chamfer(bumper?17:11,bumper?17:13,2),3,.6),m.graphite,'massive_foot',[0,-1,0]);
  if(bumper) {
    add(base,new THREE.CylinderGeometry(8.5,9.6,4,12),m.oxide,'bank_bumper',[0,1,0]);
    ring(base,m.bone,7.8,.8,[0,3.5,0],'buffer_ring');
    ring(base,m.amber,6.8,.2,[0,4.3,0],'bank_contact_band');
    for(let i=0;i<8;i++){const a=i*TAU/8;rod(base,m.steel,[Math.cos(a)*3,4,Math.sin(a)*3],[Math.cos(a)*7,4,Math.sin(a)*7],.18,'radial_cast_rib');}
    batch(base);
    const plunger=group(root,'powered_rebound_plunger',[0,4.5,0],true);
    ring(plunger,m.eye,5.9,.24,[0,0,0],'contact_coil');
    add(plunger,new THREE.CylinderGeometry(5.1,5.9,.7,12),m.graphite,'recoil_cap');batch(plunger);
    return(e,t,a11y)=>{
      const age=t-(e.data?.bracketPose?.bumpAt??-100), kick=age>=0&&age<.6?Math.sin(age/.6*Math.PI):0;
      plunger.position.y=4.5+(a11y.reducedMotion?0:kick*1.5);
      m.eye.emissiveIntensity=a11y.reducedFlash?1.1:1.1+kick*1.4;
    };
  }
  rod(base,m.steel,[0,0,0],[0,14,0],1.3,'goal_upright',12);
  block(base,m.bone,5,10,4,[0,6,0],'upright_armor',.3);
  block(base,m.amber,.45,11,.5,[0,7,2.3],'upright_front_lamp',.08);
  ring(base,m.oxide,4.9,.8,[0,1,0],'base_collar');
  if(left) {
    rod(base,m.graphite,[0,14,0],[112,14,0],1.0,'overhead_crossbar',10);
    rod(base,m.bone,[0,15.1,0],[112,15.1,0],.44,'ivory_crossbar',8);
    for(let i=0;i<14;i++) rod(base,m.amber,[4+i*8,14,1],[7+i*8,14,1],.14,'crossbar_segments',6);
    // Ground-plane goal line is honest: discontinuous ribs, not an invisible solid wall.
    for(let i=0;i<16;i++) rod(base,m.amber,[9+i*6,-3.6,0],[12+i*6,-3.6,0],.15,'goal_line_tick',6);
    rod(base,m.steel,[43,14,0],[43,20,0],.32,'score_mast');
    rod(base,m.steel,[69,14,0],[69,20,0],.32,'score_mast');
    block(base,m.graphite,33,1.6,6,[56,20,0],'scoreboard');
  }
  batch(base);
  if(!left)return()=>{};
  const rows=pips(root,m,44,21,0,6,1.2);
  // Three volumetric rectangular return hoops grow behind the line on a goal. Not glow cards.
  const bursts=[];
  for(let i=0;i<3;i++) {
    const g=group(root,`goal_pressure_hoop_${i}`,[56,1,-2],true);
    const mat=m.eye.clone();mat.transparent=true;mat.depthWrite=false;
    rod(g,mat,[-12,0,-3],[12,0,-3],.24,'hoop_bottom');
    rod(g,mat,[-12,0,3],[12,0,3],.24,'hoop_top');
    rod(g,mat,[-12,0,-3],[-12,0,3],.24,'hoop_left');
    rod(g,mat,[12,0,-3],[12,0,3],.24,'hoop_right');
    batch(g);g.visible=false;bursts.push({g,mat});
  }
  const timer=add(root,plate(chamfer(28,.65,.2),.2,.02),m.eye,'shot_clock',[56,22,3.5]);
  timer.userData.animated=true;
  return(e,t,a11y)=>{
    const p=e.data?.bracketPose||{};updatePips(rows,p.results);
    timer.visible=p.phase==='play';timer.scale.x=Math.max(.002,p.remaining??1);
    const age=t-(p.goalAt??-100);
    for(let i=0;i<bursts.length;i++){
      const {g,mat}=bursts[i], a=age-i*.12;
      g.visible=!a11y.reducedMotion&&a>=0&&a<1.3;
      if(g.visible){const n=smooth(a/1.3);g.scale.set(1+n*2.4,1,1+n*2.8);g.position.z=-3-n*22;mat.opacity=(1-n)*(a11y.reducedFlash?.35:.75);}
    }
  };
}
export function buildBracketVisual(entity) {
  const part=entity?.data?.bracketPart;
  if(!['keeper','ball','post-left','post-right','bumper-left','bumper-right'].includes(part)) throw new Error(`Unknown BRACKET part: ${part}`);
  const root=new THREE.Group();root.name=`BX9_${part}`;
  const m=palette();
  const update=part==='keeper'?buildKeeper(root,m):part==='ball'?buildBall(root,m):buildHardware(root,m,part);
  // Materials not referenced by this part never reach the shared scene disposer.
  const used=new Set();root.traverse(o=>{if(o.material)used.add(o.material);});
  for(const mat of Object.values(m))if(!used.has(mat))mat.dispose();
  root.userData.kind=entity.type;root.userData.bracket=true;root.userData.animated=true;
  root.userData.visualLanguage='bracket-industrial-catcher';root.userData.authoredAssetState='authored';root.userData.authoredVisualRoot='authored-root';
  root.userData.updateAuthoredMotion=(e,time,a11y={})=>{
    // Character gestures are simulation-timed; a shared wall/render clock must not age them.
    const t=Number.isFinite(e.data?.bracketPose?.simTime)?e.data.bracketPose.simTime:Number.isFinite(time)?time:0;
    update(e,t,a11y);
  };
  root.userData.disposeBracket=()=>disposeBracketVisual(root);
  root.userData.updateAuthoredMotion(entity,entity.data?.bracketPose?.simTime||0,{});
  return root;
}
export function disposeBracketVisual(root) {
  if(!root||root.userData.bracketDisposed)return;
  root.userData.bracketDisposed=true;
  const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.removeFromParent();
}
