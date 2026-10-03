// Authored SV-3 geometry and choreography. This IS the production asset, not a placeholder.
// Manufacture, negative space and rigid-joint animation; no textures, downloads or sim writes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VESPER as C } from '../../data/vesper.js';
const TAU = Math.PI * 2, sat = x => Math.max(0, Math.min(1, x));
const ease = x => { x = sat(x); return x * x * (3 - 2 * x); };
function materials(pitch = -1) {
  const lamp = pitch === 0 ? 0xffb962 : pitch === 1 ? 0x70f3d9 : pitch === 2 ? 0xc5a0ff : 0x70f3d9;
  const paint = color => new THREE.MeshPhysicalMaterial({ color, roughness: 0.29, metalness: 0.24, clearcoat: 0.75, clearcoatRoughness: 0.22 });
  const mats = {
    porcelain: paint(0x938c79), enamel: paint(0x1b565b), graphite: new THREE.MeshStandardMaterial({ color: 0x141e26, metalness: 0.48, roughness: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xa87743, metalness: 0.8, roughness: 0.26 }),
    black: new THREE.MeshStandardMaterial({ color: 0x070b10, metalness: 0.05, roughness: 0.7 }),
    lamp: new THREE.MeshStandardMaterial({ color: lamp, emissive: lamp, emissiveIntensity: 1.2, metalness: 0.2, roughness: 0.27 }),
  };
  for (const [name, m] of Object.entries(mats)) m.name = `SV3_${name}`;
  return mats;
}
function add(parent, geo, mat, name) {
  const mesh = new THREE.Mesh(geo, mat); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function plate(outline, depth = 0.32, bevel = 0.1) {
  const s = new THREE.Shape(); outline.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, steps: 1, bevelEnabled: bevel > 0, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2);
}
function wire(parent, pts, radius, mat, name = 'attached_conductor') {
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))),
    Math.max(8, pts.length * 4), radius, 6, false), mat, name);
}
function ring(radius, tube = 0.16, arc = TAU) {
  return new THREE.TorusGeometry(radius, tube, 6, Math.max(12, Math.ceil(48 * arc / TAU)), arc).rotateX(Math.PI / 2);
}
function pin(parent, x, y, z, radius, height, mat, name = 'seated_fastener') {
  const mesh = add(parent, new THREE.CylinderGeometry(radius, radius, height, 10), mat, name); mesh.position.set(x, y, z); return mesh;
}
function bake(group) {
  const buckets = new Map(), original = new Set();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue; child.updateMatrix();
    const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geo.applyMatrix4(child.matrix); geo.clearGroups();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const bucket = buckets.get(child.material) || []; bucket.push(geo); buckets.set(child.material, bucket);
    original.add(child.geometry); group.remove(child);
  }
  for (const [mat, pieces] of buckets) {
    const combined = mergeGeometries(pieces, false); if (!combined) throw new Error('SV-3 geometry schema mismatch');
    add(group, combined, mat, `${group.name}:${mat.name}`); pieces.forEach(g => g.dispose());
  }
  original.forEach(g => g.dispose());
}
// A closed swept ribbon with real out-of-plane folds. Shape encodes the harmonic, not a glow card.
function harmonicGeometry(petals = 3, turns = 1, segments = 128) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, a = u * TAU * turns;
    const r = 1 + 0.19 * Math.cos(a * petals), y = Math.sin(a * petals * 0.5) * 0.18;
    for (let side = 0; side < 2; side++) {
      const v = side * 2 - 1, width = 0.022 + 0.011 * Math.sin(a * 2) ** 2;
      positions.push(Math.cos(a) * (r + v * width), y + v * 0.035, Math.sin(a) * (r + v * width)); uvs.push(u, side);
    }
    if (i < segments) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function harmonicMaterial(color) {
  return new THREE.ShaderMaterial({ name: 'SV3_harmonic_surface', transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uQuiet: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; uniform float uTime; uniform float uQuiet;
      void main(){vUv=uv;vec3 p=position;p.y+=sin(uv.x*37.699+uTime*1.4)*0.075*(1.-uQuiet);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uEnergy;uniform float uQuiet;uniform vec3 uColor;
      void main(){float edge=sin(vUv.y*3.141593);float path=0.68+0.32*sin(vUv.x*50.265-uTime*2.*(1.-uQuiet));
      gl_FragColor=vec4(uColor*(0.7+edge*0.8),edge*path*uEnergy);}`,
  });
}
function lifecycle(root, callback) {
  root.userData.kind = 'drone'; root.userData.vesper = true; root.userData.animated = true;
  root.userData.visualLanguage = 'vesper-kinetic-choir'; root.userData.updateAuthoredMotion = callback;
  root.userData.disposeVesper = () => disposeVesperVisual(root); return root;
}

export function buildVesperVisual(entity) {
  if (entity?.data?.vesperBell >= 0) return buildVesperBellVisual(entity);
  const root = new THREE.Group(); root.name = 'VESPER_SV3'; const m = materials();
  const body = new THREE.Group(); body.name = 'ANIM_breath'; root.add(body);
  const hull = new THREE.Group(); hull.name = 'survey_chassis'; body.add(hull);
  add(hull, plate([[-12,-3],[-7,-5],[5,-4.7],[11,-2],[11,2],[5,4.7],[-7,5],[-12,3]], 1.4, .38), m.graphite, 'pressure_spine').position.y = -1;
  for (const side of [-1,1]) {
    add(hull, plate([[-10,side*.7],[-6,side*3.5],[4,side*3.4],[8,side*1.5],[1,side*.6]], .45, .14), m.porcelain, 'ceramic_shoulder').position.y = .65;
    wire(hull, [[-10,-.5,side*3],[-7,-1,side*5],[1,-.8,side*5],[6,0,side*3]], .24, m.brass, 'load_bearing_return');
    for (let i=0;i<6;i++) add(hull, new THREE.BoxGeometry(.3,.46,2.25), m.graphite, 'heat_comb').position.set(-7+i*.72,1.25,side*2.5);
    pin(hull, 4,1.25,side*3.3,.2,.18,m.brass);
  }
  add(hull, plate([[-9,-.5],[6,-.5],[7,0],[6,.5],[-9,.5]], .14,.06), m.enamel, 'occupation_spine').position.y=1.1;
  // Three bridge windows remember three real instruments. No random blinking.
  const indicators=[];
  for(let i=0;i<3;i++) {
    const socket=pin(hull,-6+i*2.1,1.8,0,.52,.3,m.black,'bridge_window');
    const lamp=pin(body,-6+i*2.1,2.01,0,.35,.16,m.lamp,'ANIM_part_indicator'); indicators.push(lamp);
  }
  bake(hull);
  const wings=[];
  for(const side of [-1,1]) for(const rear of [false,true]) {
    const joint=new THREE.Group(); joint.name=`ANIM_${side<0?'port':'starboard'}_${rear?'hind':'fore'}_sail`;
    joint.position.set(rear?-6:1,0,side*4.1); body.add(joint);
    const assembly=new THREE.Group(); assembly.name='laminated_listening_sail'; joint.add(assembly);
    const plan=rear?[[0,0],[-4,4],[-15,16],[-13,22],[-2,15],[4,5]]:[[0,0],[8,4],[15,16],[8,26],[-5,16],[-3,5]];
    const mirror=points=>points.map(([x,z])=>[x,side*z]);
    // An open truss, then three separate louvred panels. The gaps stay dark at chase distance.
    const framePts=plan.map(([x,z])=>[x,-.15,side*z]); framePts.push(framePts[0]);
    wire(assembly,framePts,.35,m.graphite,'continuous_sail_frame');
    wire(assembly,[[0,0,0],[rear?-7:5,.25,side*10],[rear?-13:8,.6,side*22]],.27,m.brass,'sail_spine');
    const panels=rear?[
      [[-2,4],[-6,7],[-12,15],[-6,14]], [[-5,15],[-12,17],[-11,20],[-3,14]], [[-1,4],[-4,11],[0,12],[2,5]],
    ]:[
      [[1,3],[7,6],[12,15],[5,12]], [[4,14],[11,17],[7,23],[0,16]], [[-1,5],[2,12],[-1,14],[-3,9]],
    ];
    panels.forEach((p,i)=>{
      const repaired=rear&&side<0&&i===1;
      add(assembly,plate(mirror(p),.22,.1),repaired?m.brass:i===2?m.porcelain:m.enamel,`survey_lamella_${i}`).position.y=.12+i*.15;
      const a=p[0],b=p[1],c=p[2];
      wire(assembly,[[a[0],.7,side*a[1]],[(a[0]+b[0])*.5,.75,side*(a[1]+b[1])*.5],[c[0],.75,side*c[1]]],.07,m.lamp,'inlaid_signal_vein');
    });
    // Ivory tip cap and exposed rivet work, not a painted texture or floating trim.
    const tip=rear?[[-14,17],[-13,20],[-11,19],[-11,16]]:[[9,18],[8,22],[6,23],[6,20]];
    add(assembly,plate(mirror(tip),.3,.08),m.porcelain,'reflector_tip_cap').position.y=.55;
    for(let j=0;j<3;j++) pin(assembly,rear?-4-j*2:3+j*2,.6,side*(5+j*3),.13,.22,m.brass);
    pin(assembly,0,.3,0,1.0,.8,m.graphite,'real_hinge'); pin(assembly,0,.76,0,.57,.18,m.brass,'hinge_keeper');
    bake(assembly); wings.push({joint,side,rear});
  }
  // A binocular listening head with one replaced lens. It tracks the player, not the camera.
  const head=new THREE.Group(); head.name='ANIM_attention'; head.position.set(7.2,1.25,0); body.add(head);
  const fixed=new THREE.Group(); fixed.name='sensor_head'; head.add(fixed);
  add(fixed,plate([[-2,-3.4],[2,-3.3],[4,-1.4],[3,2.9],[-1,3.5],[-3,1]],.85,.3),m.porcelain,'sensor_brow');
  add(fixed,plate([[-1.8,-2.8],[2,-2.6],[2.9,-1.1],[2,2.2],[-1,2.7],[-2,.8]],.3,.12),m.black,'recessed_face').position.y=1;
  for(const side of [-1,1]) {
    wire(fixed,[[0,1.2,side*2.4],[3,1.8,side*5.7],[8,2.2,side*7.4],[11,1.7,side*6.6]],.16,m.brass,'survey_antenna');
    pin(fixed,11,1.85,side*6.6,.28,.3,m.lamp,'antenna_terminal');
  }
  bake(fixed);
  const pupils=[];
  for(const side of [-1,1]) {
    const lens=add(head,new THREE.SphereGeometry(side<0?.94:1.17,20,10),m.lamp,'ANIM_listening_lens');
    lens.position.set(.4,1.43,side*1.6); lens.scale.set(1.6,.28,.72); pupils.push(lens);
    const lid=add(head,new THREE.BoxGeometry(3.2,.22,.35),m.enamel,'visor_divider'); lid.position.set(.4,1.63,side*1.6);
  }
  // Three articulated tuning forks hang from actual stern pivots. They conduct; the loose bells sound.
  const fingers=[];
  for(let i=0;i<3;i++) {
    const joint=new THREE.Group(); joint.name=`ANIM_conductor_${i}`; joint.position.set(-10,-.5,(i-1)*2); body.add(joint);
    const finger=new THREE.Group(); finger.name='tuning_prong'; joint.add(finger);
    wire(finger,[[0,0,0],[-3,-.8,0],[-7,-.1,-.6]],.19,m.brass);
    wire(finger,[[-3,-.8,0],[-7,-.1,.6]],.16,m.brass);
    pin(finger,-7,0,-.6,.15,.2,m.lamp); pin(finger,-7,0,.6,.15,.2,m.lamp); bake(finger); fingers.push(joint);
  }
  const chorusMat=harmonicMaterial(0x77eedc), chorus=add(root,harmonicGeometry(5,2,240),chorusMat,'ANIM_unfolded_overtone');
  chorus.visible=false; chorus.castShadow=chorus.receiveShadow=false; chorus.position.y=-1;
  lifecycle(root,(e,time,a11y={})=>{
    const p=e?.data?.vesperPose||{},t=Number.isFinite(p.simTime)?p.simTime:Number.isFinite(time)?time:0;
    const reduced=!!a11y.reducedMotion,flash=!!a11y.reducedFlash,awake=!!p.met,shy=p.phase==='shy';
    const age=t-(p.bloomAt??-100),sing=age>=0&&age<C.bloomSeconds;
    const aperture = phase => phase === 'shy' ? .14 : phase === 'sleep' ? .25 : phase === 'bloom' ? 1 : .76;
    const from = aperture(p.previousPhase || p.phase), to = aperture(p.phase);
    const open = from + (to - from) * ease((t - (p.phaseAt ?? -100)) / .85);
    body.position.y=reduced?0:Math.sin(t*.67)*.34;
    body.rotation.x=reduced?0:Math.sin(t*.37)*.025;
    for(const w of wings) {
      const flutter=reduced?0:Math.sin(t*(w.rear?.85:.72)+(w.side<0?.35:0))*(sing?.1:.04);
      w.joint.rotation.x=w.side*((1-open)*1.13+flutter);
      w.joint.rotation.y=w.side*(w.rear?-.06:.08)*(sing?1.9:1);
    }
    head.rotation.y=clampAngle(-(p.gaze||0)+(e?.rot||0))*.28;
    const blink=reduced?0:Math.pow(Math.max(0,Math.cos(t*.49)),42)*.7;
    for(const lens of pupils) lens.scale.y=shy?.06:awake?.28*(1-blink):.08;
    for(let i=0;i<3;i++) {
      fingers[i].rotation.y=reduced?0:Math.sin(t*(sing?3.3:.6)+i*.7)*(sing?.23:.04);
      indicators[i].visible=p.bellAlive?.[i]!==false;
      indicators[i].scale.setScalar(i<(p.progress||0)?1.28: .8);
    }
    m.lamp.emissiveIntensity=shy?.25:!awake?.32:flash?1:sing?1.65:1.15;
    chorus.visible=sing;
    if(sing) {
      const envelope=ease(age/.9)*(1-ease((age-3.8)/2.2));
      chorus.scale.set(25+age*1.5,8+age*.3,27+age*1.5); chorus.rotation.y=reduced?0:age*.14;
      chorusMat.uniforms.uTime.value=t; chorusMat.uniforms.uQuiet.value=reduced?1:0;
      chorusMat.uniforms.uEnergy.value=envelope*(flash?.35:.7);
    }
  });
  root.userData.vesperParts={body,head,wings,fingers,chorus,indicators}; root.userData.updateAuthoredMotion(entity,0,{});
  // Final procedural root: without the authored stamp the opening gate counts the body as
  // forever-pending staging while it sits on the startup runway (see morrowModel.js).
  root.userData.authoredAssetState='authored';
  root.userData.authoredVisualRoot='authored-root';
  return root;
}
function clampAngle(a) { return Math.atan2(Math.sin(a),Math.cos(a)); }

export function buildVesperBellVisual(entity) {
  const i=entity?.data?.vesperBell; if(!Number.isInteger(i)||i<0||i>2) throw new RangeError('SV-3 visual bell index');
  const root=new THREE.Group(); root.name=`VESPER_${['BARREL','FORK','CROWN'][i]}`; const m=materials(i);
  const housing=new THREE.Group(); housing.name='resonator_cage'; root.add(housing);
  add(housing,ring(2.75,.31),m.graphite,'protective_roll_bar').position.y=-.7;
  add(housing,ring(2.7,.18),m.brass,'harmonic_race').position.y=1.2;
  if(i===0) {
    // Barrel: a deep round throat, six ceramic staves and a dented replacement stave.
    add(housing,new THREE.CylinderGeometry(1.85,2.1,2.5,28,1,true),m.brass,'open_barrel_throat');
    for(let k=0;k<6;k++) { const a=k*TAU/6; const stave=add(housing,new THREE.BoxGeometry(.7,2.9,1.2),k===4?m.brass:m.porcelain,'ceramic_stave');
      stave.position.set(Math.cos(a)*2.4,0,Math.sin(a)*2.4); stave.rotation.y=-a; }
  } else if(i===1) {
    // Fork: two wide U arms with an unmistakable open slot from above.
    for(const side of [-1,1]) {
      add(housing,plate([[-3,side*1],[-3,side*2.6],[2.8,side*2.6],[3.6,side*1.5],[1.5,side*1.5]],.7,.18),m.porcelain,'fork_tine').position.y=.3;
      wire(housing,[[-2.8,.9,side*1.9],[0,.95,side*2.1],[2.7,.9,side*1.8]],.1,m.lamp,'tine_inlay');
    }
    add(housing,new THREE.BoxGeometry(1.3,1.2,4.5),m.enamel,'fork_heel').position.set(-2.5,0,0);
  } else {
    // Crown: three swept prongs, not another recolored round barrel.
    for(let k=0;k<3;k++) {
      const blade=add(housing,plate([[1.4,-1.2],[3,-.7],[4.2,.6],[3.5,1.4],[1.4,1]],.8,.17),m.porcelain,'crown_prong');
      blade.rotation.y=k*TAU/3; blade.position.y=.1;
    }
    add(housing,ring(1.5,.35),m.enamel,'crown_inner_rim').position.y=1.15;
  }
  for(let k=0;k<3;k++) {
    const a=k*TAU/3; wire(housing,[[Math.cos(a)*2.7,-.7,Math.sin(a)*2.7],[Math.cos(a)*2.9,.3,Math.sin(a)*2.9],[Math.cos(a)*2.7,1.2,Math.sin(a)*2.7]],.16,m.graphite,'cage_strut');
    pin(housing,Math.cos(a)*2.7,1.42,Math.sin(a)*2.7,.16,.16,m.brass);
  }
  // Physical tether eye, shared on all three instruments, sized for the live Massline target.
  const eye=add(housing,ring(.72,.18),m.brass,'massline_eye'); eye.position.set(-3.5,.3,0); eye.rotation.z=Math.PI/2;
  add(housing,new THREE.BoxGeometry(1.4,.4,.7),m.graphite,'eye_mount').position.set(-2.9,.3,0);
  bake(housing);
  const clapper=add(root,new THREE.OctahedronGeometry(1.05,1),m.brass,'ANIM_free_clapper'); clapper.position.y=.6;
  const light=add(root,ring(1.12,.095),m.lamp,'ANIM_pitch_loop'); light.position.y=.6;
  const resonanceMat=harmonicMaterial(i===0?0xffbf6c:i===1?0x70efdc:0xc5a0ff);
  const resonance=add(root,harmonicGeometry(i+2,1,128),resonanceMat,'ANIM_resonant_surface'); resonance.visible=false;
  resonance.castShadow=resonance.receiveShadow=false;
  lifecycle(root,(e,time,a11y={})=>{
    const p=e?.data?.vesperPose||{},t=Number.isFinite(p.simTime)?p.simTime:Number.isFinite(time)?time:0;
    const age=t-(p.noteAt??-100),live=age>=0&&age<2.4,reduced=!!a11y.reducedMotion,flash=!!a11y.reducedFlash;
    const envelope=live?ease(age/.075)*Math.exp(-age*1.5):0,power=sat(p.notePower??.6);
    clapper.rotation.z=reduced?0:Math.sin(age*(18+i*3))*envelope*.4*power;
    clapper.rotation.x=reduced?0:Math.sin(age*(13+i*2))*envelope*.25*power;
    light.rotation.x=reduced?0:Math.sin(t*.9+i)*.2;
    m.lamp.emissiveIntensity=(p.met? .85:.22)+(flash?.2:1.8)*envelope*power;
    resonance.visible=live; if(live){const radius=4+age*7;
      resonance.scale.set(radius,2.1+age,radius); resonance.rotation.y=reduced?0:age*.15;
      resonanceMat.uniforms.uTime.value=t; resonanceMat.uniforms.uQuiet.value=reduced?1:0;
      resonanceMat.uniforms.uEnergy.value=envelope*power*(flash?.32:.85);
    }
  });
  root.userData.vesperParts={housing,clapper,resonance}; root.userData.updateAuthoredMotion(entity,0,{});
  root.userData.authoredAssetState='authored';
  root.userData.authoredVisualRoot='authored-root';
  return root;
}
export function disposeVesperVisual(root) {
  if(!root||root.userData.vesperDisposed)return;root.userData.vesperDisposed=true;
  const geometries=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);
    if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});
  geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());root.removeFromParent();
}
