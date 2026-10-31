// Authored articulated character, not a generic ship fallback. +X is forward, +Y is up.
// Eight bounded instanced chains replace hundreds of scene nodes and physics constraints.
// Geometry is shared; pose, emissive response and instance buffers belong to each live body.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ironKrakenProfileFor } from '../data/ironKraken.js';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../data/encounters/capital-boss/iron-kraken.js';
import { installIllustratedSurface } from './illustratedSurface.js';

export const IRON_KRAKEN_ARM_COUNT = 8;
export const IRON_KRAKEN_LINKS_PER_ARM = 22;
const ARMS = IRON_KRAKEN_ARM_COUNT, LINKS = IRON_KRAKEN_LINKS_PER_ARM;
const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const heavyBeats = new Map(IRON_KRAKEN_HEAVY.score.beats.map(b => [b.id, b]));
const colossalBeats = new Map(IRON_KRAKEN_COLOSSUS.score.beats.map(b => [b.id, b]));
let resources = null, interiorResources = null;

function shared(value, name) {
  value.name = `IronKraken_${name}`;
  value.userData.spacefaceSharedAsset = true;
  if (value.isBufferGeometry) {
    value.computeBoundingSphere();
    value.setAttribute('sfHullPosition', value.attributes.position.clone());
  }
  return value;
}
function material(name, options, physical = false) {
  const m = physical ? new THREE.MeshPhysicalMaterial(options) : new THREE.MeshStandardMaterial(options);
  m.userData.spacefaceFinish = 'forge-v1';
  installIllustratedSurface(m);
  return shared(m, name);
}
function moved(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
}
function merged(parts, name) {
  const plain = parts.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    n.clearGroups(); return n;
  });
  const result = mergeGeometries(plain, false);
  for (const g of plain) g.dispose();
  if (!result) throw new Error(`Iron Kraken geometry mismatch: ${name}`);
  return shared(result, name);
}
function lathe(points, steps = 16, start = 0, length = TAU) {
  return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), steps, start, length);
}
function horizontalRing(radius, tube, y, segments = 32) {
  return moved(new THREE.TorusGeometry(radius, tube, 4, segments), 0, y, 0, Math.PI / 2);
}
function inward(geometry) {
  const index=geometry.index.array, normal=geometry.attributes.normal;
  for(let i=0;i<index.length;i+=3){const swap=index[i+1];index[i+1]=index[i+2];index[i+2]=swap;}
  for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
  return geometry;
}
function petalEdges(outer,inner,start,sweep,steps) {
  const positions=[],a=new THREE.Vector3(),b=new THREE.Vector3(),normal=new THREE.Vector3();
  const point=(p,t)=>[Math.sin(t)*p[0],p[1],Math.cos(t)*p[0]];
  const quad=(p0,p1,p2,p3,wanted)=>{
    a.fromArray(p1).sub(b.fromArray(p0));b.fromArray(p2).sub(new THREE.Vector3().fromArray(p0));
    normal.crossVectors(a,b);
    const order=normal.dot(new THREE.Vector3().fromArray(wanted))>=0?[p0,p1,p2,p0,p2,p3]:[p0,p2,p1,p0,p3,p2];
    for(const p of order)positions.push(...p);
  };
  for(const [t,side] of [[start,1],[start+sweep,-1]]) {
    const wanted=[-Math.cos(t)*side,0,Math.sin(t)*side];
    for(let i=0;i<outer.length-1;i++)quad(point(outer[i],t),point(outer[i+1],t),point(inner[i+1],t),point(inner[i],t),wanted);
  }
  for(let i=0;i<steps;i++){
    const t0=start+sweep*i/steps,t1=start+sweep*(i+1)/steps;
    quad(point(outer[0],t0),point(outer[0],t1),point(inner[0],t1),point(inner[0],t0),[0,-1,0]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  return g;
}
function inspectionPort(rows) {
  const positions=[];
  for(let i=0;i<rows.length-1;i++){
    const point=(row,side)=>[Math.cos(row[2])*row[0],row[1],side*Math.sin(row[2])*row[0]];
    const a=point(rows[i],-1),b=point(rows[i+1],-1),c=point(rows[i+1],1),d=point(rows[i],1);
    positions.push(...a,...b,...c,...a,...c,...d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.computeVertexNormals();g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  return g;
}

/** One small cache for both sizes. No textures, asset downloads, interior, or per-unit caches. */
export function getIronKrakenVisualResources() {
  if (resources) return resources;
  const materials = {
    shell: material('ivory_enamel', { color: 0xb8b2a5, metalness: .18, roughness: .43,
      clearcoat: .28, clearcoatRoughness: .34 }, true),
    dark: material('recessed_machinery', { color: 0x141b21, metalness: .52, roughness: .43 }),
    red: material('signal_vermilion', { color: 0xc23a20, metalness: .24, roughness: .4 }),
    metal: material('joint_steel', { color: 0x636967, metalness: .78, roughness: .35 }),
    lens: material('optical_glass', { color: 0x07151a, metalness: .35, roughness: .19,
      clearcoat: .85, clearcoatRoughness: .14 }, true),
  };
  const g = {};
  // Rounded tapered sleeves; their dark articulated gaps are geometry, not texture noise.
  g.armor = shared(lathe([[.7,-.5],[.91,-.45],[1,-.32],[.96,.28],[.84,.44],[.68,.5]], 8), 'arm_sleeve');
  g.joint = shared(new THREE.SphereGeometry(1, 8, 4), 'universal_joint');
  g.sucker = shared(moved(new THREE.TorusGeometry(.82, .16, 3, 8), 0, 0, -.1), 'suction_rim');
  g.suckerCore = shared(moved(lathe([[0,-.06],[.77,0],[.82,.10],[.64,.13]], 8), 0, 0, 0, -Math.PI/2), 'suction_cup');
  const hardware = [moved(new THREE.BoxGeometry(.16,.54,.055), 0, 0, .98)];
  for (const x of [-.58,.58]) for (const y of [-.30,.30]) {
    hardware.push(moved(new THREE.OctahedronGeometry(.065, 0), x, y, .79));
  }
  g.hardware = merged(hardware, 'sleeve_fasteners');
  g.stripe = shared(moved(new THREE.BoxGeometry(.52,.16,.045), 0, .13, .97), 'sleeve_warning_strip');

  const white = [lathe([[0,-.46],[.55,-.46],[.74,-.3],[.87,-.04],[.91,.29],[.91,.34]], 40)];
  const black = [lathe([[0,-.71],[.46,-.71],[.65,-.57],[.71,-.36],[.59,-.29],[0,-.29]], 32),
    horizontalRing(.906,.018,.31), horizontalRing(.762,.02,-.28)];
  const red = [horizontalRing(.63,.025,-.56)];
  for (let arm = 0; arm < ARMS; arm++) {
    const a = arm*TAU/ARMS + Math.PI/8, x = Math.cos(a), z = Math.sin(a);
    const socket = new THREE.CylinderGeometry(.205,.205,.26,12);
    const orient = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(x,0,z));
    socket.applyQuaternion(orient); socket.translate(x*.79,-.39,z*.79); black.push(socket);
    const rim = new THREE.TorusGeometry(.205,.025,4,16);
    rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), new THREE.Vector3(x,0,z)));
    rim.translate(x*.91,-.39,z*.91); white.push(rim);
  }
  // Front optics sit at +/- 34 degrees; both must read from the front.
  const eyes = [], lenses = [], rims = [], iris = [];
  for (const side of [-1,1]) {
    const a = side*.59, x = Math.cos(a), z = Math.sin(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), new THREE.Vector3(x,0,z));
    const eye = lathe([[0,-.16],[.24,-.16],[.31,-.1],[.32,.07],[.29,.16],[0,.16]],24);
    eye.applyQuaternion(q); eye.translate(x*.80,.20,z*.80); eyes.push(eye);
    const barrel = new THREE.CylinderGeometry(.263,.263,.15,24);
    barrel.applyQuaternion(q); barrel.translate(x*.99,.20,z*.99); lenses.push(barrel);
    const rq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(x,0,z));
    const rim = new THREE.TorusGeometry(.254,.019,5,32);
    rim.applyQuaternion(rq); rim.translate(x*1.075,.20,z*1.075); rims.push(rim);
    const inner = new THREE.TorusGeometry(.155,.014,4,24);
    inner.applyQuaternion(rq); inner.translate(x*1.083,.20,z*1.083); iris.push(inner);
    const pupil = new THREE.SphereGeometry(.095,12,6);
    pupil.scale(.4,1,1); pupil.rotateY(-a); pupil.translate(x*1.082,.20,z*1.082); lenses.push(pupil);
    // Small lens bolts around the camera barrel, merged into one dark surface.
    for (let k=0;k<8;k++) {
      const t=k*TAU/8, off=Math.sin(t)*.287;
      black.push(moved(new THREE.SphereGeometry(.015,6,3),x*1.026-z*off,.20+Math.cos(t)*.287,z*1.026+x*off));
    }
  }
  white.push(...eyes); red.push(...rims);
  const crownY=y=>.32+(y-.32)*.84;
  g.hull = merged(white,'pressure_hull'); g.hullDark = merged(black,'collar_and_optic_mounts');
  g.hullRed = merged(red,'collar_and_optic_rims'); g.lens = merged(lenses,'black_lenses');
  g.iris = merged(iris,'optical_iris');

  // Each petal is authored around a hinge at (.86,.32,0), then instanced around the crown.
  const petalProfile = [[.91,.32],[.89,.58],[.81,.91],[.65,1.22],[.43,1.46],[.17,1.58],[0,1.60]].map(([r,y])=>[r,crownY(y)]);
  const half = Math.PI/ARMS-.014;
  const innerProfile=petalProfile.map(([r,y])=>[Math.max(0,r-.035),y]);
  const petalStart=Math.PI/2-half;
  g.shell = merged([lathe(petalProfile,8,petalStart,half*2),
    petalEdges(petalProfile,innerProfile,petalStart,half*2,8)],'mantle_petal');
  g.shell.translate(-.86,-.32,0);
  // Thin inner armor belongs to the same eight instanced petals. Opening never exposes
  // one-sided paper surfaces; no complete hidden engine is required behind the shell.
  const detail = [inward(lathe(innerProfile,8,petalStart,half*2))], accents = [];
  // The inspection cap is split across the petal tips, so it opens with them and cannot
  // remain floating above an exposed pump or a hollow successor wreck.
  detail.push(lathe([[0,crownY(1.55)],[.20,crownY(1.55)],
    [.18,crownY(1.63)],[0,crownY(1.63)]],4,petalStart,half*2));
  accents.push(new THREE.TorusGeometry(.18,.016,4,4,half*2)
    .rotateX(Math.PI/2).rotateY(half).translate(0,crownY(1.63),0));
  // Long narrow inspection recess and industrial rivet rows, seated on the pressure shell.
  detail.push(inspectionPort([[.875,crownY(.68),.14],[.823,crownY(.91),.12],
    [.665,crownY(1.22),.09],[.465,crownY(1.43),.04]]));
  for (let row=0;row<5;row++) {
    const y=crownY(.43+row*.205);
    const radius = row===0?.904:row===1?.872:row===2?.828:row===3?.74:.615;
    for (const sign of [-1,1]) {
      const a=sign*(half-.043);
      detail.push(moved(new THREE.SphereGeometry(.016,6,3),Math.cos(a)*radius,y,Math.sin(a)*radius));
    }
  }
  accents.push(lathe([[.893,crownY(.58)],[.875,crownY(.69)]],4,Math.PI/2-.15,.30));
  detail.push(lathe([[.894,crownY(.56)],[.891,crownY(.578)]],5,Math.PI/2-.18,.36));
  g.shellDetail = merged(detail,'petal_inspection_ports'); g.shellDetail.translate(-.86,-.32,0);
  g.shellAccent = merged(accents,'petal_serial_strips'); g.shellAccent.translate(-.86,-.32,0);
  // A dark articulated beak gives the underside a purpose instead of an empty sphere.
  const jaw = new THREE.SphereGeometry(1,12,8,0,Math.PI);
  jaw.scale(.27,.16,.19); jaw.translate(.05,0,0);
  g.beak = shared(jaw,'siphon_beak');
  g.jet = shared(new THREE.CylinderGeometry(1,1,1,12,1,false),'pressure_jet_volume');
  resources = { geometries:g, materials };
  return resources;
}

// Small reveal-only pump. No inner engine is built or submitted while the mantle is closed.
function getInteriorResources() {
  if (interiorResources) return interiorResources;
  const dark = [moved(new THREE.CylinderGeometry(.34,.45,.67,16),0,.72,0),
    moved(new THREE.SphereGeometry(.46,16,8),0,.38,0)];
  const rings = [], steel = [];
  for (let i=0;i<3;i++) rings.push(horizontalRing(.34,.035,.53+i*.18,20));
  for (let i=0;i<6;i++) {
    const a=i*TAU/6;
    steel.push(moved(new THREE.CylinderGeometry(.035,.035,.57,6),Math.cos(a)*.47,.65,Math.sin(a)*.47));
  }
  interiorResources = { dark:merged(dark,'exposed_pump'), rings:merged(rings,'pump_coolant_rings'),
    steel:merged(steel,'pump_tie_rods') };
  return interiorResources;
}

/** Pure fixed-clock choreography. Pass caller-owned output; no timer or simulation writes. */
export function ironKrakenAnimationPose(fight, simTime=0, a11y={}, out={}) {
  const live = !!fight && !fight.suspended && !fight.terminal;
  const beats = fight?.encounterId === IRON_KRAKEN_COLOSSUS.id ? colossalBeats : heavyBeats;
  const cast = live ? fight.cast : null, beat = cast ? beats.get(cast.beatId) : null;
  const age = beat ? Math.max(0,fight.clock-cast.startedAt) : 0;
  const active = !!beat && age>=beat.tellTicks && age<beat.tellTicks+beat.activeTicks;
  const charge = beat ? smooth(age/beat.tellTicks) : 0;
  out.time = live && Number.isFinite(fight.clock) ? fight.clock/60 : (Number.isFinite(simTime)?simTime:0);
  out.jet = beat?.id==='siphon_jet' ? (active?1:charge) : 0;
  out.jetActive = beat?.id==='siphon_jet' && active;
  out.rake = beat?.id==='arm_rake' ? (active?1:charge*.65) : 0;
  out.ink = beat?.id==='ink_ring' ? (active?1:charge*.6) : 0;
  out.inkActive = beat?.id==='ink_ring' && active;
  // Begin venting at the end of the committed attack so the vulnerable recovery aperture
  // is already readable when its damage bonus starts; the simulation still owns the window.
  out.mantle = live && fight.phase==='recovery' ? smooth((fight.nextAt-fight.clock)/18)
    : active ? smooth((age-beat.tellTicks-beat.activeTicks+18)/18) : 0;
  out.charge = beat ? (active?1:charge) : 0;
  out.reducedMotion = !!a11y.reducedMotion; out.reducedFlash = !!a11y.reducedFlash;
  out.missingShellMask = 0;
  if (live && Array.isArray(fight.plates)) for (const p of fight.plates) {
    if (p.attached===false && p.id==='mantle_port') out.missingShellMask |= 1<<6;
    if (p.attached===false && p.id==='mantle_starboard') out.missingShellMask |= 1<<2;
  }
  return out;
}

function mesh(parent, geometry, material, name) {
  const m = new THREE.Mesh(geometry,material); m.name=name; m.castShadow=m.receiveShadow=true;
  parent.add(m); return m;
}
function instances(parent, geometry, material, count, name) {
  const m = new THREE.InstancedMesh(geometry,material,count); m.name=name;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false;
  m.castShadow=m.receiveShadow=true; parent.add(m); return m;
}

/** The same primary character asset is used by the normal game and the inspection harness. */
export function createIronKrakenVisual(entity) {
  const profile = ironKrakenProfileFor(entity);
  if (!profile) throw new Error('Iron Kraken visual requires an Iron Kraken enemy identity');
  const {geometries:g,materials:m}=getIronKrakenVisualResources();
  const root = new THREE.Group(), body = new THREE.Group();
  root.name = `IronKraken_${profile.variant}`; body.name='eight_arm_pressure_body';
  body.scale.setScalar(profile.coreRadius); root.add(body);
  mesh(body,g.hull,m.shell,'ivory_pressure_hull');
  mesh(body,g.hullDark,m.dark,'black_lower_collar');
  mesh(body,g.hullRed,m.red,'warning_livery');
  mesh(body,g.lens,m.lens,'twin_camera_eyes');
  // Per-body emission is not shared: one charging creature cannot blink every other one.
  const glow=material('live_optical_response',{color:0xd94928,emissive:0xd33816,emissiveIntensity:.25,
    roughness:.42,metalness:.2});
  delete glow.userData.spacefaceSharedAsset;
  mesh(body,g.iris,glow,'focusing_iris');
  const shell=instances(body,g.shell,m.shell,ARMS,'opening_mantle_petals');
  const shellDetail=instances(body,g.shellDetail,m.dark,ARMS,'mantle_ports_and_fasteners');
  const shellAccent=instances(body,g.shellAccent,m.red,ARMS,'mantle_warning_plates');
  const armor=instances(body,g.armor,m.shell,ARMS*LINKS,'articulated_arm_armor');
  const joints=instances(body,g.joint,m.dark,ARMS*LINKS,'exposed_universal_joints');
  const hardware=instances(body,g.hardware,m.dark,ARMS*LINKS,'arm_service_panels');
  const stripes=instances(body,g.stripe,m.red,ARMS*LINKS,'arm_warning_strips');
  const suckers=instances(body,g.sucker,m.red,ARMS*LINKS,'red_suction_rims');
  const suckerCores=instances(body,g.suckerCore,m.dark,ARMS*LINKS,'dark_suction_cups');
  const jaws=[mesh(body,g.beak,m.dark,'siphon_jaw_left'),mesh(body,g.beak,m.dark,'siphon_jaw_right')];
  jaws[0].position.set(.12,-.70,-.09); jaws[1].position.set(.12,-.70,.09); jaws[1].rotation.y=Math.PI;
  const jetMaterial=new THREE.MeshBasicMaterial({color:0xff783b,transparent:true,opacity:.16,depthWrite:false});
  const jetCoreMaterial=new THREE.MeshBasicMaterial({color:0xffd5a4,transparent:true,opacity:.66,depthWrite:false});
  const jet=mesh(root,g.jet,jetMaterial,'committed_pressure_jet');
  const jetCore=mesh(root,g.jet,jetCoreMaterial,'pressure_jet_spindle');
  jet.castShadow=jet.receiveShadow=jetCore.castShadow=jetCore.receiveShadow=false;
  jet.visible=jetCore.visible=false;
  const pose={}, points=new Float32Array(ARMS*(LINKS+1)*3);
  const matrix=new THREE.Matrix4(),basis=new THREE.Matrix4(),q=new THREE.Quaternion();
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),tangent=new THREE.Vector3();
  const normal=new THREE.Vector3(),binormal=new THREE.Vector3(),yAxis=new THREE.Vector3(0,1,0);
  const yawQ=new THREE.Quaternion(),hingeQ=new THREE.Quaternion(),zAxis=new THREE.Vector3(0,0,1);
  const armMeshes=[armor,joints,hardware,stripes,suckers,suckerCores];
  const armorMeshes=[armor,hardware,stripes];
  const shellMeshes=[shell,shellDetail,shellAccent];
  let interior=null,disposed=false,lastTime=null,lastClock=null,lastA11y='',jetBlend=0,mantleBlend=0;
  let rakeBlend=0,inkCurlBlend=0,inkLiftBlend=0;
  const ownerId=entity.id;
  const armLength=profile.armReach/profile.coreRadius-.85;
  const write=(target,index,x,y,z,sx,sy,sz)=>{
    position.set(x,y,z);scale.set(sx,sy,sz);matrix.compose(position,q,scale);target.setMatrixAt(index,matrix);
  };
  function update(liveEntity,simTime=0,a11y={},state=null) {
    if(disposed||!liveEntity||liveEntity.id!==ownerId)return;
    const fight=state?.capitalBossEncounters?.fights?.[liveEntity.data?.ironKraken?.fightId];
    const time=Number.isFinite(state?.simTime)?state.simTime:simTime;
    const a11yKey=(a11y.reducedMotion?'m':'')+(a11y.reducedFlash?'f':'');
    if(time===lastTime&&fight?.clock===lastClock&&a11yKey===lastA11y)return;
    const dt=lastTime===null?.2:Math.max(0,Math.min(.25,time-lastTime));
    lastTime=time;lastClock=fight?.clock;lastA11y=a11yKey;
    ironKrakenAnimationPose(fight,time,a11y,pose);
    const blend=1-Math.exp(-dt*8);
    jetBlend+=(pose.jet-jetBlend)*blend;mantleBlend+=(pose.mantle-mantleBlend)*blend;
    rakeBlend+=(pose.rake-rakeBlend)*blend;
    inkCurlBlend+=((pose.inkActive?-.64:.36)*pose.ink-inkCurlBlend)*blend;
    inkLiftBlend+=((pose.inkActive?-.28:.65)*pose.ink-inkLiftBlend)*blend;
    const t=pose.time,quiet=pose.reducedMotion?0:1;
    body.position.y=Math.sin(t*.72)*.035*profile.coreRadius*quiet;
    body.rotation.x=Math.sin(t*.47)*.045*quiet;
    body.rotation.z=-jetBlend*1.02+Math.sin(t*.39)*.035*quiet;
    // Rotate the attack apparatus to the committed world bearing, never invent another target.
    body.rotation.y=fight?.cast && Number.isFinite(fight.cast.heading)
      ? -(fight.cast.heading-(liveEntity.rot||0)) : 0;
    glow.emissiveIntensity=pose.reducedFlash?.28:.24+pose.charge*.65+mantleBlend*.35;
    for(let i=0;i<ARMS;i++) {
      const a=i*TAU/ARMS,absent=(pose.missingShellMask&(1<<i))!==0;
      yawQ.setFromAxisAngle(yAxis,-a);hingeQ.setFromAxisAngle(zAxis,-mantleBlend*.88);
      q.copy(yawQ).multiply(hingeQ);
      for(const part of shellMeshes)write(part,i,Math.cos(a)*.86,.32,Math.sin(a)*.86,absent?0:1,absent?0:1,absent?0:1);
    }
    for(const part of shellMeshes)part.instanceMatrix.needsUpdate=true;
    if(mantleBlend>.02&&!interior) {
      const inside=getInteriorResources();interior=new THREE.Group();interior.name='reveal_only_pump';
      mesh(interior,inside.dark,m.dark,'shallow_pump_body');mesh(interior,inside.steel,m.metal,'pump_tie_rods');
      mesh(interior,inside.rings,glow,'red_pump_rings');body.add(interior);
      root.userData.ironKrakenRig.interior=interior;
    }
    if(interior){interior.visible=mantleBlend>.015;interior.position.y=mantleBlend*.12;}
    jaws[0].rotation.x=-pose.charge*.24;jaws[1].rotation.x=pose.charge*.24;
    // Arm curvature grows as s^4: quiet roots, broad middle arcs, tight terminal spirals.
    // The curl plane differs per arm so the limbs explore volume instead of forming one flat star.
    for(let arm=0;arm<ARMS;arm++) {
      const a=arm*TAU/ARMS+Math.PI/8,ca=Math.cos(a),sa=Math.sin(a),phase=arm*1.71;
      const plane=.55*Math.sin(phase*.7),up=Math.sqrt(1-plane*plane);
      const vx=-sa*plane,vy=up,vz=ca*plane;
      let x=ca*.87,y=-.39,z=sa*.87;
      const start=arm*(LINKS+1)*3;points[start]=x;points[start+1]=y;points[start+2]=z;
      const flank=Math.abs(sa)>.45?1:.25;
      // Ink gathers the eight tips around the mantle, then fans them open on discharge.
      // The gesture follows the same tell/active boundary as the broken ion-ring field.
      const curl=(5.65+.65*Math.sin(t*.65+phase)*quiet)*(1-jetBlend*.94)*(1-rakeBlend*flank*.82)*(1+inkCurlBlend);
      const lift=.10+.16*Math.sin(t*.63+phase)*quiet+rakeBlend*flank*.45+inkLiftBlend;
      for(let link=0;link<LINKS;link++) {
        const s=(link+.5)/LINKS;
        const broadDip=(.34+.12*Math.sin(phase))*Math.sin(s*Math.PI)*(1-rakeBlend*.6);
        const bend=lift+curl*s*s*s*s-broadDip + quiet*Math.sin(t*1.1-s*4.5+phase)*.08*s;
        let tx=ca*Math.cos(bend)+vx*Math.sin(bend),ty=vy*Math.sin(bend),tz=sa*Math.cos(bend)+vz*Math.sin(bend);
        // Before the hull pitches forward, fold limbs down: after the pitch they stream aft.
        tx=tx*(1-jetBlend)+ca*.16*jetBlend;tz=tz*(1-jetBlend)+sa*.16*jetBlend;
        ty=ty*(1-jetBlend)-jetBlend;
        const inv=1/Math.hypot(tx,ty,tz);tx*=inv;ty*=inv;tz*=inv;
        const length=armLength*(1.32-.64*s)/LINKS;
        const nx=x+tx*length,ny=y+ty*length,nz=z+tz*length;
        const offset=start+(link+1)*3;points[offset]=nx;points[offset+1]=ny;points[offset+2]=nz;
        tangent.set(tx,ty,tz);
        binormal.set(-sa*vy,-plane,ca*vy).normalize();
        // Orthogonalize against the folded tangent; no unstable up-vector branch at vertical.
        binormal.addScaledVector(tangent,-binormal.dot(tangent)).normalize();
        normal.crossVectors(binormal,tangent).normalize();basis.makeBasis(binormal,tangent,normal);q.setFromRotationMatrix(basis);
        const radius=.15*Math.pow(1-s,.92)+.022,index=arm*LINKS+link;
        const cx=(x+nx)*.5,cy=(y+ny)*.5,cz=(z+nz)*.5;
        for(const part of armorMeshes)write(part,index,cx,cy,cz,radius,length*.72,radius);
        write(joints,index,x,y,z,radius*.73,radius*.73,radius*.73);
        const cup=radius*.80;
        write(suckers,index,cx-normal.x*radius*.94,cy-normal.y*radius*.94,cz-normal.z*radius*.94,cup,cup,cup);
        write(suckerCores,index,cx-normal.x*radius*.94,cy-normal.y*radius*.94,cz-normal.z*radius*.94,cup,cup,cup);
        x=nx;y=ny;z=nz;
      }
    }
    for(const part of armMeshes)part.instanceMatrix.needsUpdate=true;
    // The attack is a locked pressure jet, not unseen hull contact at the far end of a charge.
    // Exact score endpoints keep the luminous volume on the same lane as authoritative damage.
    const shape=pose.jetActive?fight?.cast?.shapes?.[0]:null;
    jet.visible=jetCore.visible=!!shape&&shape.kind==='lane';
    if(jet.visible) {
      const rot=liveEntity.rot||0,c=Math.cos(rot),s=Math.sin(rot);
      const wx=(shape.a.x+shape.b.x)*.5-liveEntity.pos.x,wz=(shape.a.z+shape.b.z)*.5-liveEntity.pos.z;
      const dx=shape.b.x-shape.a.x,dz=shape.b.z-shape.a.z,length=Math.hypot(dx,dz);
      tangent.set(c*dx+s*dz,0,-s*dx+c*dz).normalize();q.setFromUnitVectors(yAxis,tangent);
      jet.position.set(c*wx+s*wz,0,-s*wx+c*wz);jet.quaternion.copy(q);jet.scale.set(shape.radius,length,shape.radius);
      jetCore.position.copy(jet.position);jetCore.quaternion.copy(q);jetCore.scale.set(shape.radius*.13,length,shape.radius*.13);
      jetMaterial.opacity=pose.reducedFlash?.10:.17;jetCoreMaterial.opacity=pose.reducedFlash?.32:.65;
    }
  }
  root.userData.kind='ship';root.userData.animated=true;
  root.userData.authoredAssetState='authored';root.userData.authoredVisualRoot='iron-kraken-articulated';
  root.userData.generatedVisualProducer='iron-kraken-character-v1';
  root.userData.visualLanguage='ivory_pressure_shell_vermilion_optics_eight_arms';
  // A cast is world-locked while its body lunges. Include both the full pressure lane and
  // a one-second movement allowance, so its far end cannot disappear with the head off glass.
  const visualReach=Math.max(profile.armReach*1.08,profile.jetLength+profile.maxSpeed+profile.coreRadius);
  root.userData.visualBounds={center:[0,0,0],size:[visualReach*2,profile.armReach*2.16,visualReach*2]};
  root.userData.ironKrakenRig={body,armor,joints,suckers,shell,shellDetail,shellAccent,points,interior:null,profile,pose};
  root.userData.updateAuthoredMotion=update;
  root.userData.detachAuthoredMotion=()=>{
    if(disposed)return;disposed=true;
    for(const part of [...armMeshes,...shellMeshes])part.dispose();
    delete root.userData.updateAuthoredMotion;
  };
  // Explicit tooling teardown; live teardown uses detachAuthoredMotion then the normal disposer.
  root.userData.disposeIronKraken=()=>{
    root.userData.detachAuthoredMotion();glow.dispose();jetMaterial.dispose();jetCoreMaterial.dispose();root.removeFromParent();
  };
  update(entity,0,{});
  return root;
}
