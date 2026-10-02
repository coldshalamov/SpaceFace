// Authored parametric character, NOT a fallback body. R-07 is a rescue automaton, not a
// flyable hull. All topology, rigid parts, choreography and force surfaces live here.
// Used unchanged by visualFactory and the review bench. No textures, loads or sim writes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MORROW } from '../../data/morrow.js';

const TAU = Math.PI * 2;
const sat = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = sat(x); return x * x * (3 - 2 * x); };

function finishes() {
  const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3,
    metalness: 0.25, clearcoat: 0.65, clearcoatRoughness: 0.24 });
  const result = {
    ivory: paint(0x968c79), teal: paint(0x20545d), dark: new THREE.MeshStandardMaterial({
      color: 0x131d25, metalness: 0.65, roughness: 0.38 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xae7950, metalness: 0.78, roughness: 0.27 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x070d12, metalness: 0.12, roughness: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe7ba70, emissive: 0xffb957,
      emissiveIntensity: 1.8, roughness: 0.26, metalness: 0.35 }),
    eye: new THREE.MeshPhysicalMaterial({ color: 0x54c9be, emissive: 0x70fff0,
      emissiveIntensity: 2.1, metalness: 0.25, roughness: 0.15, clearcoat: 1 }),
  };
  for (const [name, material] of Object.entries(result)) material.name=`R07_${name}`;
  return result;
}
function mesh(parent, geometry, material, name) {
  const m = new THREE.Mesh(geometry, material); m.name = name;
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function plate(outline, thickness = 0.65, bevel = 0.15) {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: bevel > 0,
    bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 10 });
  g.rotateX(-Math.PI / 2); return g;
}
function arcPlate(inner, outer, a0, a1, thickness = 0.6, segments = 12) {
  const outline = [];
  for (let i = 0; i <= segments; i++) { const a = a0 + (a1 - a0) * i / segments; outline.push([Math.cos(a) * outer, Math.sin(a) * outer]); }
  for (let i = segments; i >= 0; i--) { const a = a0 + (a1 - a0) * i / segments; outline.push([Math.cos(a) * inner, Math.sin(a) * inner]); }
  return plate(outline, thickness, 0.1);
}
function ring(radius, tube = 0.16, arc = TAU) {
  return new THREE.TorusGeometry(radius, tube, 6, Math.max(12, Math.round(52 * arc / TAU)), arc).rotateX(Math.PI / 2);
}
function pipe(parent, points, radius, material, name) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(parent, new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, 6, false), material, name);
}
function pin(parent, x, y, z, radius, height, material, name) {
  const m = mesh(parent, new THREE.CylinderGeometry(radius, radius * 1.08, height, 10), material, name);
  m.position.set(x, y, z); return m;
}
// Merge ONLY rigid assemblies. Joint roots remain separate, animation-safe transforms. Shared
// index/normal/uv schema is normalized before merge; no unique material per bolt or plate.
function bakeRigid(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), oldGeometries = new Set();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    g.applyMatrix4(child.matrix); g.clearGroups();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const list = buckets.get(child.material) || []; list.push(g); buckets.set(child.material, list);
    oldGeometries.add(child.geometry); group.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error('Morrow rigid mesh schema mismatch');
    mesh(group, merged, material, `${group.name}:${material.name || 'finish'}`);
    for (const g of geometries) g.dispose();
  }
  for (const g of oldGeometries) g.dispose();
}

function makeCurtain(inner, outer, a0 = 0, a1 = TAU, segments = 96) {
  const pos = [], uv = [], index = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + (a1 - a0) * i / segments;
    for (let j = 0; j <= 4; j++) {
      const q = j / 4, r = inner + (outer - inner) * q;
      pos.push(Math.cos(a) * r, Math.sin(q * Math.PI) * 2.6, Math.sin(a) * r);
      uv.push(i / segments, q);
      if (i < segments && j < 4) { const k = i * 5 + j; index.push(k, k + 5, k + 1, k + 1, k + 5, k + 6); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals(); return g;
}
function curtainMaterial() {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uQuiet: { value: 0 }, uPulse: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; uniform float uTime; uniform float uQuiet;
      void main(){ vUv=uv; vec3 p=position;
        p.y+=(1.0-uQuiet)*sin(uv.x*37.699-uTime*1.9)*sin(uv.y*3.14159)*1.6;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uEnergy;
      uniform float uQuiet; uniform float uPulse; uniform float uOpacity;
      void main(){
        float edge=sin(vUv.y*3.14159);
        float flow=0.5+0.5*sin(vUv.x*75.398-uTime*(1.0-uQuiet)*2.4+vUv.y*4.0);
        float gap=smoothstep(0.10,0.27,fract(vUv.x*12.0));
        float seam=pow(max(0.0,1.0-abs(vUv.y-0.73)*18.0),2.0);
        vec3 body=mix(vec3(0.06,0.24,0.24),vec3(0.90,0.57,0.20),flow*0.45+uPulse*0.35);
        vec3 color=body*(0.5+uEnergy)+vec3(1.0,0.82,0.44)*seam*(0.8+uEnergy);
        float alpha=edge*gap*(0.08+uEnergy*0.18+seam*0.34);
        gl_FragColor=vec4(color,alpha*uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function buildMorrowVisual(entity = { radius: MORROW.radius, data: {} }) {
  const root = new THREE.Group(); root.name = 'MORROW_R07';
  const mat = finishes();
  const body = new THREE.Group(); body.name = 'R07_chassis'; root.add(body);
  const chassis = new THREE.Group(); chassis.name = 'layered_rescue_bell'; body.add(chassis);

  // Bell body: curved load-bearing shell, deeply inset face, stacked mechanical neck.
  const profile = [[0,-3.5],[1.8,-3.6],[3.8,-2.8],[5.8,-1.7],[6.5,-0.4],[6.1,0.8],
    [5.5,1.5],[4.8,1.9],[3.7,2.2],[3.1,2.4],[3.1,1.7],[4.4,1.2],[5,0.3],[4.3,-1.8],[0,-2.8]];
  mesh(chassis, new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 40), mat.dark, 'pressure_bell');
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    const shell = mesh(chassis, arcPlate(4.0, 6.15, a + 0.05, a + 0.94, 0.65), i === 4 ? mat.copper : mat.ivory, 'ceramic_repair_shell');
    shell.position.y = 0.8;
    const seam = mesh(chassis, arcPlate(5.2, 5.7, a + 0.12, a + 0.84, 0.12), mat.teal, 'occupation_band');
    seam.position.y = 1.57;
    pin(chassis, Math.cos(a + 0.48) * 4.6, 1.8, Math.sin(a + 0.48) * 4.6, 0.14, 0.17, mat.copper, 'shell_fastener');
  }
  for (let i = 0; i < 3; i++) {
    const m = mesh(chassis, ring(3.15 + i * 0.3, 0.17), i === 1 ? mat.copper : mat.dark, 'neck_flange'); m.position.y = 1.9 + i * 0.36;
  }
  // Asymmetrical C-halo: six armored vertebrae and a repaired exposed-copper seventh.
  for (let i = 0; i < 7; i++) {
    const a0 = 0.56 + i * 0.735, a1 = a0 + 0.65;
    const a = (a0 + a1) / 2;
    const armor = mesh(chassis, arcPlate(10.3, 13.6, a0, a1, 0.95), i === 5 ? mat.copper : mat.ivory, 'broken_halo_armor');
    armor.position.y = -0.3 + (i === 5 ? -0.25 : 0);
    const under = mesh(chassis, arcPlate(9.6, 13.0, a0 - 0.035, a1 + 0.035, 0.62), mat.dark, 'halo_load_frame'); under.position.y = -1.35;
    const band = mesh(chassis, arcPlate(11.1, 12.0, a0 + 0.025, a1 - 0.025, 0.10), mat.teal, 'halo_inlay'); band.position.y = 0.8;
    const light = mesh(chassis, arcPlate(10.45, 10.63, a0 + 0.09, a1 - 0.06, 0.08), mat.gold, 'rescue_light'); light.position.y = 0.8;
    pipe(chassis, [[Math.cos(a)*5,-0.3,Math.sin(a)*5],[Math.cos(a)*7.6,-1.2,Math.sin(a)*7.6],[Math.cos(a)*11,-0.9,Math.sin(a)*11]], 0.34, mat.dark, 'halo_spoke');
    for (const r of [11, 13]) pin(chassis, Math.cos(a0+0.1)*r, 0.95, Math.sin(a0+0.1)*r, 0.13, 0.12, mat.copper, 'flush_lock');
  }
  // Crown's missing arc is not "fixed": two exposed return lines bridge only part of it.
  pipe(chassis, [[9.3,-1.2,-7.5],[13,-1.7,-4.0],[12,-1.4,-2.1]], 0.16, mat.copper, 'old_return_line');
  pipe(chassis, [[9.6,-1.4,-7.8],[13.5,-1.9,-4.3],[12.5,-1.8,-1.9]], 0.11, mat.dark, 'return_line_sleeve');
  // A small original number plate, represented by seven recessed bars, not texture text.
  const tally = mesh(chassis, plate([[-10,-1.4],[-8.5,-1.4],[-8.5,1.4],[-10,1.4]], 0.16), mat.rubber, 'seven_rescues_plate'); tally.position.y=1.0;
  for (let i=0;i<7;i++) { const b=mesh(chassis,new THREE.BoxGeometry(0.9,0.12,0.12),mat.copper,'rescue_tally'); b.position.set(-9.2,1.3,-1.05+i*0.35); }
  bakeRigid(chassis);

  // A gimballed monocular eye. Its six shutters are real overlapping, bevelled leaves.
  const head = new THREE.Group(); head.name = 'ANIM_gaze'; head.position.y = 2.55; body.add(head);
  const headFixed = new THREE.Group(); headFixed.name = 'gimbal_mount'; head.add(headFixed);
  pin(headFixed, 0, 0.12, 0, 3.1, 0.75, mat.dark, 'eye_socket');
  mesh(headFixed, ring(2.8,0.17), mat.copper, 'eye_brass_lip').position.y=0.7;
  mesh(headFixed, ring(2.48,0.09), mat.gold, 'eye_luminous_gasket').position.y=0.74;
  const lens = mesh(headFixed, new THREE.SphereGeometry(2.34,32,16), mat.eye, 'convex_rescue_eye'); lens.scale.set(1,0.25,1); lens.position.y=0.66;
  const pupil = mesh(headFixed, new THREE.SphereGeometry(0.87,24,12), mat.rubber, 'offcentre_pupil'); pupil.scale.set(1,0.12,1); pupil.position.set(0.54,1.2,0);
  const catchlight = mesh(headFixed, new THREE.SphereGeometry(0.20,12,8), mat.gold, 'inner_lens_reflection'); catchlight.position.set(1.30,1.19,-0.63);
  bakeRigid(headFixed);
  const lids=[];
  for (let i=0;i<6;i++) {
    const joint=new THREE.Group(); joint.name=`ANIM_iris_${i}`;
    const a=i*TAU/6; joint.position.set(Math.cos(a)*2.8,0,Math.sin(a)*2.8); joint.rotation.y=-a; head.add(joint);
    const leaf=mesh(joint,plate([[-2.78,-0.12],[-0.60,-1.10],[0.45,-0.48],[0.38,0.38],[-1.70,0.80]],0.16,0.055),mat.teal,'iris_leaf'); leaf.position.y=1.30;
    lids.push(joint);
  }
  // Two rescue arms: one original long jaw; one shorter brass replacement. Every joint attaches.
  const arms=[];
  for (const side of [-1,1]) {
    const joint=new THREE.Group(); joint.name=side<0?'ANIM_original_arm':'ANIM_replacement_arm'; joint.position.set(5.8,-0.2,side*7.2); body.add(joint);
    const assembly=new THREE.Group(); assembly.name='rescue_forearm'; joint.add(assembly);
    pin(assembly,0,0,0,1.2,1.4,mat.dark,'arm_pivot');
    pin(assembly,0,0.8,0,0.70,0.18,mat.copper,'pivot_lock');
    const outline=side<0?[[0,-1.3],[3,-1.7],[9,-1.5],[12,0],[10,1.2],[4,0.8],[0,1.1]]:
      [[0,-1.2],[4,-1.0],[8,-0.5],[9.6,0.8],[7.5,1.5],[3,0.9],[0,1.1]];
    const beam=mesh(assembly,plate(outline,0.7),side<0?mat.ivory:mat.copper,'tapered_manipulator'); beam.position.y=-0.5;
    const stripe=mesh(assembly,plate([[1,-0.27],[6.7,-0.34],[8.7,0],[6.5,0.32],[1,0.28]],0.12,0.04),mat.teal,'arm_occupation_inlay'); stripe.position.y=0.30;
    pipe(assembly,[[0,-0.6,0],[3,-0.85,0],[7,-0.70,0],[9,-0.35,0.2]],0.18,mat.dark,'hydraulic_return');
    for(let k=0;k<3;k++) {
      const tooth=mesh(assembly,plate([[7.7+k*0.95,0.4],[8.15+k*0.95,0.2],[8.5+k*0.95,1.9],[8.2+k*0.95,2.25]],0.35,0.07),mat.dark,'grapple_finger'); tooth.position.y=-0.3;
    }
    pin(assembly,8.1,0.62,0,0.32,0.2,mat.gold,'tractor_emitter');
    bakeRigid(assembly); arms.push(joint);
  }

  // Suspended mnemonic chimes: metal instruments, not particles. Unequal lengths tell age.
  const chimes=[];
  for(let i=0;i<3;i++) {
    const joint=new THREE.Group(); joint.name=`ANIM_memory_chime_${i}`; joint.position.set(-10.6,-1.0,(i-1)*2.0); body.add(joint);
    const assembly=new THREE.Group(); assembly.name='chime'; joint.add(assembly);
    pipe(assembly,[[0,0,0],[-2.0,-0.2,0],[-3.4,-0.55,0]],0.07,mat.dark,'chime_suspension');
    const bell=mesh(assembly,new THREE.CylinderGeometry(0.32,0.65,2.3+i*0.4,10,1,true),mat.copper,'tuned_bell');
    bell.rotation.z=Math.PI/2; bell.position.set(-4.3-i*0.15,-0.65,0);
    pin(assembly,-4.7-i*0.15,-0.4,0,0.11,0.35,mat.gold,'clapper');
    bakeRigid(assembly); chimes.push(joint);
  }
  // Internal gyroscope lives inside a supported cage. Slow axis change is personality, not spin spam.
  const gyro=new THREE.Group(); gyro.name='ANIM_gyro'; gyro.position.y=-1.2; body.add(gyro);
  const rim=mesh(gyro,ring(7.35,0.12,Math.PI*1.7),mat.copper,'open_gyro_race'); rim.rotation.z=0.20;
  const runner=mesh(gyro,ring(7.05,0.065,Math.PI*1.7),mat.gold,'gyro_runner'); runner.rotation.z=0.20;

  const field=new THREE.Group(); field.name='Morrow_opt_in_field'; root.add(field);
  const fieldMat=curtainMaterial();
  const inner=mesh(field,makeCurtain(MORROW.orbitInner-1,MORROW.orbitInner+2),fieldMat,'inner_clearance_curtain');
  const outer=mesh(field,makeCurtain(MORROW.orbitOuter-4,MORROW.orbitOuter),fieldMat,'outer_capture_curtain');
  inner.castShadow=outer.castShadow=false; inner.receiveShadow=outer.receiveShadow=false;
  field.position.y=-2.2; field.visible=false;
  const pulseMat=curtainMaterial();
  const pulse=mesh(root,makeCurtain(0.90,1,-0.46,0.46,32),pulseMat,'directed_return_front');
  pulse.castShadow=false; pulse.receiveShadow=false; pulse.visible=false;

  // Semantics expected by the shared visualFactory/renderer. Animated closures are retained
  // by the renderer; there is no timer, custom render loop or onBeforeRender matrix mutation.
  root.userData.kind='drone'; root.userData.visualLanguage='morrow-rescue-automaton';
  root.userData.animated=true; root.userData.morrow=true;
  root.userData.updateAuthoredMotion=(e, time, a11y={}) => {
    const p=e?.data?.morrowPose || {};
    const t=Number.isFinite(p.simTime)?p.simTime:(Number.isFinite(time)?time:0), reduce=!!a11y.reducedMotion, flash=!!a11y.reducedFlash;
    const awake=p.awake === true, active=p.phase==='armed'||p.phase==='windup';
    const shy=p.phase==='shy', charge=sat(p.charge||0);
    const drift=reduce?0:Math.sin(t*0.63)*0.075;
    body.position.y=reduce?0:Math.sin(t*0.72)*0.25;
    body.rotation.x=drift*0.20; body.rotation.z=drift*0.24;
    const gaze=Number.isFinite(p.gaze)?p.gaze:0;
    head.rotation.y=-gaze+(e?.rot||0);
    head.rotation.z=awake&&!reduce?Math.sin(gaze)*0.07:0;
    let aperture=awake?0.90:0.12;
    if (shy) aperture=0.10;
    if (active) aperture=0.90+charge*0.12;
    // Blink is a lid gesture, not a light flash. A11y uses the same informative awake/shy shape.
    const blink=reduce?0:Math.pow(Math.max(0,Math.cos(t*0.61)),48)*0.66;
    for(let i=0;i<lids.length;i++) lids[i].rotation.y=-i*TAU/6+(aperture-blink)*0.95;
    const age=t-(p.gestureAt??-100), dance=p.gesture==='dance'&&age>=0&&age<4;
    for(let i=0;i<arms.length;i++) {
      const sign=i===0?-1:1;
      arms[i].rotation.y=sign*(0.18+(active?0.24+charge*0.22:0)+(shy?-0.4:0));
      arms[i].rotation.z=reduce?0:(dance?Math.sin(age*5.4+i)*0.22:Math.sin(t*0.74+i)*0.018);
    }
    for(let i=0;i<chimes.length;i++) chimes[i].rotation.y=reduce?0:Math.sin(t*(0.85+i*0.13)+i)*0.10+(dance?Math.sin(age*5+i)*0.15:0);
    gyro.rotation.y=reduce?0:t*0.08; gyro.rotation.x=reduce?0:Math.sin(t*0.13)*0.19;
    mat.eye.emissiveIntensity=shy?0.30:awake?(flash?1.1:1.6+charge*0.6):0.16;
    mat.gold.emissiveIntensity=awake?(flash?1.0:1.4+charge*0.5):0.28;
    field.visible=active;
    fieldMat.uniforms.uTime.value=t; fieldMat.uniforms.uQuiet.value=reduce?1:0;
    fieldMat.uniforms.uEnergy.value=0.25+sat(p.sweep||0)*0.45+charge*(flash?0.2:0.5);
    fieldMat.uniforms.uPulse.value=charge;
    const launchAge=t-(p.launchAt??-100), live=launchAge>=0&&launchAge<1.3;
    pulse.visible=live;
    if(live) {
      const progress=sat(launchAge/1.3), radius=18+progress*110;
      pulse.scale.set(radius,1,radius);
      pulse.rotation.y=-(p.launchYaw||0)+(e?.rot||0);
      pulse.position.y=-1;
      pulseMat.uniforms.uTime.value=t;
      pulseMat.uniforms.uQuiet.value=reduce?1:0;
      pulseMat.uniforms.uEnergy.value=(1-smooth(progress))*(flash?0.65:1.4);
      pulseMat.uniforms.uPulse.value=1;
      pulseMat.uniforms.uOpacity.value=1-smooth(progress);
    }
  };
  root.userData.updateAuthoredMotion(entity,0,{});
  root.userData.morrowParts={body,head,arms,lids,chimes,field,pulse,gyro};
  // Explicit final-owner disposal for tools. The live renderer also traverses these resources.
  root.userData.disposeMorrow=()=>disposeMorrowVisual(root);
  return root;
}

export function disposeMorrowVisual(root) {
  if (!root || root.userData.morrowDisposed) return;
  root.userData.morrowDisposed=true;
  const geometries=new Set(),materials=new Set();
  root.traverse((o)=>{ if(o.geometry)geometries.add(o.geometry); if(o.material) {
    for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m); } });
  for(const g of geometries)g.dispose(); for(const m of materials)m.dispose();
  root.removeFromParent();
}
