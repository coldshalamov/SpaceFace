// Iron Kraken pressure / manipulator / ion presentation. The score is the only danger owner.
// Closed, shared envelopes carry moving folds; private uniforms carry a bounded lifecycle.
import * as THREE from 'three';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../data/encounters/capital-boss/iron-kraken.js';

const EMPTY = Object.freeze({});
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const heavyBeats = new Map(IRON_KRAKEN_HEAVY.score.beats.map(beat => [beat.id, beat]));
const colossalBeats = new Map(IRON_KRAKEN_COLOSSUS.score.beats.map(beat => [beat.id, beat]));
const KIND = Object.freeze({ siphon_jet: 0, arm_rake: 1, ink_ring: 2 });
const RELEASE_SECONDS = Object.freeze([0.46, 0.32, 0.62]);
let resources;

function shared(geometry, name) {
  geometry.name = `IronKraken_${name}`;
  geometry.userData.spacefaceSharedAsset = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function jetEnvelope() {
  const positions = [], uvs = [], indices = [];
  const axial = 40, radial = 20;
  for (let i = 0; i <= axial; i++) {
    const u = i / axial, radius = 0.30 + 0.50 * Math.pow(Math.sin(Math.PI * u), 0.55) + 0.10 * u;
    for (let j = 0; j < radial; j++) {
      const angle = j / radial * TAU;
      positions.push(u, Math.cos(angle) * radius, Math.sin(angle) * radius);
      uvs.push(u, j / radial);
    }
  }
  for (let i = 0; i < axial; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial;
    indices.push(a, b, a + radial, b, b + radial, a + radial);
  }
  for (const end of [0, axial]) {
    const center = positions.length / 3;
    positions.push(end / axial, 0, 0); uvs.push(end / axial, 0);
    for (let j = 0; j < radial; j++) {
      const a = end * radial + j, b = end * radial + (j + 1) % radial;
      indices.push(center, end === 0 ? b : a, end === 0 ? a : b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return shared(geometry, 'closed_pressure_transport');
}

function sectorEnvelope(inner, halfAngle, name) {
  const positions = [], uvs = [], indices = [];
  const radial = 10, angular = 40, row = angular + 1, layer = (radial + 1) * row;
  for (let side = 0; side < 2; side++) for (let r = 0; r <= radial; r++) {
    const u = r / radial, radius = inner + (1 - inner) * u;
    for (let a = 0; a <= angular; a++) {
      const v = a / angular, angle = (v * 2 - 1) * halfAngle;
      positions.push(Math.cos(angle) * radius, side === 0 ? 1 : -1, Math.sin(angle) * radius);
      uvs.push(u, v);
    }
  }
  for (let side = 0; side < 2; side++) for (let r = 0; r < radial; r++) for (let a = 0; a < angular; a++) {
    const p = side * layer + r * row + a;
    if (side === 0) indices.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
    else indices.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
  }
  // Four joined walls make a genuine shallow volume, including both safe-gap end caps.
  const wall = (a, b) => indices.push(a, a + layer, b, b, a + layer, b + layer);
  for (let a = 0; a < angular; a++) { wall(a + 1, a); wall(radial * row + a, radial * row + a + 1); }
  for (let r = 0; r < radial; r++) { wall(r * row, (r + 1) * row); wall((r + 1) * row + angular, r * row + angular); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return shared(geometry, name);
}

export function getIronKrakenAttackVfxResources() {
  if (!resources) {
    const aperture = new THREE.TorusGeometry(0.153, 0.022, 8, 32);
    aperture.rotateY(Math.PI / 2);
    resources = Object.freeze({
      jet: jetEnvelope(),
      rake: sectorEnvelope(0.82 * 28 / 98, 0.83, 'closed_manipulator_wake'),
      ink: sectorEnvelope(1.15 / 1.8, 1.03, 'closed_broken_ion_curtain'),
      aperture: shared(aperture, 'front_throat_light_seal'),
    });
  }
  return resources;
}

const vertexShader = `
  uniform float uKind, uTime, uMotion, uInner, uHalfAngle;
  varying vec2 vUv;
  varying vec3 vView;
  varying float vFold;
  const float PI=3.141592653589793;
  void main(){
    vUv=uv;
    float t=uTime*uMotion;
    vec3 p=position;
    float wave=sin(uv.x*19.0-uv.y*12.566-t*8.4);
    float secondary=sin(uv.x*11.0+uv.y*18.850-t*5.3+1.7);
    vFold=wave*.67+secondary*.33;
    if(uKind<.5){
      // A bowed six-lobed pressure body, not a rigid glowing cylinder. Both rolls advect.
      float curtain=.83+.105*wave+.055*secondary;
      p.yz*=curtain;
      float bow=sin(PI*uv.x)*.025;
      p.y+=bow*sin(uv.x*7.0-t*2.1);
      p.z+=bow*cos(uv.x*9.0-t*1.8);
    }else{
      // Deformation is strictly inside the locked annular sector. Zero displacement at its
      // radial/angular edges protects the real inner safe area and the two clear escape gaps.
      float radiusU=uv.x+.030*sin(PI*uv.x)*wave;
      float radius=mix(uInner,1.0,radiusU);
      float angle=(uv.y*2.0-1.0)*uHalfAngle;
      angle+=min(.025,uHalfAngle*.15)*sin(PI*uv.y)*secondary;
      p.xz=radius*vec2(cos(angle),sin(angle));
      float shear=sin(uv.y*18.0-uv.x*8.0-t*3.7);
      float thickness=.57+.23*wave+.13*shear;
      p.y=position.y*thickness;
      p.y+=.055*sin(PI*uv.x)*sin(uv.y*9.0+t*1.9);
    }
    vec4 view=modelViewMatrix*vec4(p,1.0);
    vView=view.xyz;
    gl_Position=projectionMatrix*view;
  }
`;

const fragmentShader = `
  uniform float uKind,uTime,uMotion,uProgress,uActive,uRelease,uFlash,uOpacity,uCoverage;
  varying vec2 vUv;
  varying vec3 vView;
  varying float vFold;
  void main(){
    vec3 N=normalize(cross(dFdx(vView),dFdy(vView)));
    float sideLight=.32+.68*abs(dot(N,normalize(vec3(.35,.75,.45))));
    float t=uTime*uMotion;
    float front=0.0;
    float channel=0.0;
    float body=1.0;
    float releaseMask=1.0;
    if(uKind<.5){
      float flow=vUv.x*15.0-vUv.y*12.566-t*8.4;
      channel=.5+.5*sin(flow+.7*sin(vUv.x*6.0+t*2.1));
      float crest=.65+.18*sin(vUv.y*18.85+t*1.2);
      front=smoothstep(crest-fwidth(channel)*2.0,crest+.11,channel);
      body=(.35+.65*smoothstep(.05,.28,vUv.x))*(1.0-smoothstep(.84,1.0,vUv.x));
      // Supply stops at release; a cutoff travels downstream. Nothing shrinks back to source.
      releaseMask=smoothstep(uRelease*1.15-.10,uRelease*1.15+.08,vUv.x);
    }else if(uKind<1.5){
      // The entire sector is already dangerous. Arm travel only supplies a secondary highlight.
      float sweep=mix(.04,.96,mix(.5,uProgress,uMotion));
      float d=vUv.y-sweep;
      front=exp(-d*d*230.0);
      float wake=smoothstep(-.29,-.04,d)*(1.0-smoothstep(.04,.12,d));
      channel=.5+.5*sin(vUv.x*17.0-vUv.y*8.0-t*4.4);
      body=(.11+.62*wake)*smoothstep(.0,.10,vUv.x)*(1.0-smoothstep(.89,1.0,vUv.x));
      releaseMask=(1.0-uRelease)*smoothstep(uRelease*.85-.12,uRelease*.85+.14,vUv.y);
    }else{
      // Broad folded ion/ink curtains occupy each authored arc while the nose/tail stay clear.
      float transported=vUv.x*11.5-vUv.y*8.0-t*5.7;
      channel=.5+.5*sin(transported+.8*sin(vUv.y*15.0+t*1.6));
      float crest=.70+.14*sin(vUv.y*21.0-t*2.1);
      front=smoothstep(crest-fwidth(channel)*2.0,crest+.13,channel);
      float radial=smoothstep(.0,.09,vUv.x)*(1.0-smoothstep(.88,1.0,vUv.x));
      float angular=smoothstep(.0,.045,vUv.y)*(1.0-smoothstep(.955,1.0,vUv.y));
      body=radial*angular;
      // Unequal fragments cool and open gaps without continuing a powered boundary.
      releaseMask=1.0-smoothstep(.16+.28*channel,.76+.24*channel,uRelease);
    }
    vec3 dark=uKind>1.5?vec3(.027,.045,.075):vec3(.045,.029,.019);
    vec3 warm=uKind>1.5?vec3(.23,.43,.60):vec3(.82,.20,.055);
    vec3 hot=uKind>1.5?vec3(.60,.86,1.05):vec3(1.28,.66,.24);
    // Damage resolves over the WHOLE cast on its first active tick. A constant low-radiance
    // danger body establishes that truth; travelling crests do not grant a moving safe region.
    float activeHeat=front*uActive*uFlash;
    vec3 colour=dark*(.65+sideLight)+warm*(uActive*.38+channel*.22+activeHeat*.58)+hot*activeHeat*.55;
    // Spent matter is cool and desaturated immediately: it no longer reads as a damaging arc.
    colour=mix(vec3(.10,.13,.15)*sideLight,colour,uActive);
    float opacity=max(uCoverage,body*(.13+.19*channel+.21*activeHeat))*uOpacity;
    if(uActive>.5)releaseMask=1.0;
    opacity*=mix(.38,1.0,uActive)*releaseMask*(1.0-uRelease*.68);
    if(opacity<.004)discard;
    gl_FragColor=vec4(colour,opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function fieldMaterial() {
  const material = new THREE.ShaderMaterial({ name: 'IronKraken_private_transported_attack',
    vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true, blending: THREE.NormalBlending,
    uniforms: { uKind: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 },
      uInner: { value: 0 }, uHalfAngle: { value: 0 }, uProgress: { value: 0 },
      uActive: { value: 0 }, uRelease: { value: 0 }, uFlash: { value: 1 }, uOpacity: { value: 1 },
      uCoverage: { value: 0 } },
  });
  material.userData.ironKrakenAttack = true;
  return material;
}

/** Caller-owned output. A cast's world coordinates remain locked while the source lunges. */
export function ironKrakenAttackLocalFrame(shape, entity, out) {
  const rotation = Number.isFinite(entity?.rot) ? entity.rot : 0;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  let x, z, heading;
  if (shape.kind === 'lane') {
    x = shape.a.x; z = shape.a.z;
    const dx = shape.b.x - x, dz = shape.b.z - z;
    heading = Math.atan2(dz, dx);
    out.length = Math.hypot(dx, dz); out.radius = shape.radius;
  } else {
    x = shape.x; z = shape.z; heading = shape.heading;
    out.inner = shape.inner; out.outer = shape.outer; out.halfAngle = shape.halfAngle;
  }
  x -= entity?.pos?.x || 0; z -= entity?.pos?.z || 0;
  out.x = c * x + s * z; out.z = -s * x + c * z;
  out.yaw = rotation - heading;
  return out;
}

function validShape(shape, kind) {
  if (kind === 0) return shape?.kind === 'lane'
    && Number.isFinite(shape.a?.x) && Number.isFinite(shape.a?.z)
    && Number.isFinite(shape.b?.x) && Number.isFinite(shape.b?.z)
    && Number.isFinite(shape.radius) && shape.radius > 0
    && Math.hypot(shape.b.x - shape.a.x, shape.b.z - shape.a.z) > 0;
  return shape?.kind === 'sector' && Number.isFinite(shape.x) && Number.isFinite(shape.z)
    && Number.isFinite(shape.heading) && Number.isFinite(shape.inner) && shape.inner >= 0
    && Number.isFinite(shape.outer) && shape.outer > shape.inner
    && Number.isFinite(shape.halfAngle) && shape.halfAngle > 0 && shape.halfAngle <= Math.PI;
}

/**
 * Root-local attack geometry must stay outside the pitched/scaled character body.
 * Reparent `aperture` into the body: it is normalized to body radius, at (+1,-.27,0).
 * Four fixed slots support two live arcs plus two short retirements; no render-loop allocation.
 */
export function createIronKrakenAttackVfx(root, profile) {
  const g = getIronKrakenAttackVfxResources();
  const beats = profile.variant === 'colossus' ? colossalBeats : heavyBeats;
  const group = new THREE.Group(); group.name = 'iron_kraken_attack_volumes'; root.add(group);
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const material = fieldMaterial(), mesh = new THREE.Mesh(g.jet, material);
    mesh.name = `kraken_attack_slot_${i}`; mesh.visible = false;
    mesh.castShadow = mesh.receiveShadow = false;
    // Shader uses the exact live dimensions. Four bounded draws avoid a shader/CPU box mismatch.
    mesh.frustumCulled = false; mesh.renderOrder = 5; group.add(mesh);
    slots.push({ mesh, material, visible: false, active: false, castId: null, shapeIndex: -1,
      kind: 0, born: 0, releaseAt: 0, lastFlow: 0, progress: 0, seen: false,
      shape: { kind: 'lane', a: { x: 0, z: 0 }, b: { x: 0, z: 0 }, radius: 1,
        x: 0, z: 0, heading: 0, inner: 0, outer: 1, halfAngle: 1 } });
  }
  const apertureMaterial = new THREE.MeshStandardMaterial({ name: 'IronKraken_private_throat_emission',
    color: 0x79371b, emissive: 0xff5522, emissiveIntensity: 0, roughness: .38, metalness: .24 });
  const aperture = new THREE.Mesh(g.aperture, apertureMaterial);
  aperture.name = 'front_throat_charge_and_recovery_seal'; aperture.position.set(1.01, -.27, 0);
  aperture.visible = false; aperture.castShadow = aperture.receiveShadow = false; root.add(aperture);
  const diagnostics = { activeCount: 0, releasingCount: 0, clock: 0, phase: 'idle',
    reducedMotion: false, reducedFlash: false, disposed: false, aperture: 'off' };
  const frame = {};
  let disposed = false, lastClock = null, ownerId = null, fightId = null;

  function clear() {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]; slot.visible = slot.active = slot.seen = slot.mesh.visible = false;
      slot.castId = null; slot.material.uniforms.uActive.value = 0;
      slot.material.uniforms.uCoverage.value = 0;
    }
    aperture.visible = false; apertureMaterial.emissiveIntensity = 0;
    diagnostics.activeCount = diagnostics.releasingCount = 0;
    diagnostics.phase = 'idle'; diagnostics.aperture = 'off';
  }

  function project(slot, entity) {
    ironKrakenAttackLocalFrame(slot.shape, entity, frame);
    slot.mesh.position.set(frame.x, 0, frame.z); slot.mesh.rotation.set(0, frame.yaw, 0);
    if (slot.kind === 0) slot.mesh.scale.set(frame.length, frame.radius, frame.radius);
    else {
      slot.mesh.scale.set(frame.outer, profile.coreRadius * (slot.kind === 2 ? .26 : .11), frame.outer);
      slot.material.uniforms.uInner.value = frame.inner / frame.outer;
      slot.material.uniforms.uHalfAngle.value = frame.halfAngle;
    }
  }

  function update(entity, fight, pose = EMPTY, simTime = 0, a11y = EMPTY) {
    if (disposed) return diagnostics;
    const clock = Number.isFinite(fight?.clock) ? fight.clock / 60 : (Number.isFinite(simTime) ? simTime : 0);
    const reducedMotion = !!(a11y.reducedMotion || pose.reducedMotion);
    const reducedFlash = !!(a11y.reducedFlash || pose.reducedFlash);
    if ((lastClock !== null && clock < lastClock) || ownerId !== entity?.id || fightId !== fight?.fightId) clear();
    ownerId = entity?.id; fightId = fight?.fightId; lastClock = clock;
    diagnostics.clock = clock; diagnostics.reducedMotion = reducedMotion; diagnostics.reducedFlash = reducedFlash;
    if (!entity || entity.alive === false || (Number.isFinite(entity.hull) && entity.hull <= 0)
      || !fight || fight.suspended || fight.terminal) { clear(); return diagnostics; }
    const cast = fight.cast, beat = cast ? beats.get(cast.beatId) : null;
    const kind = beat ? KIND[beat.id] : undefined;
    const active = fight.phase === 'active' && cast?.fired === true && kind !== undefined;
    const age = beat ? Math.max(0, fight.clock - cast.startedAt - beat.tellTicks) / 60 : 0;
    const progress = beat ? clamp(age / (beat.activeTicks / 60)) : 0;
    diagnostics.phase = active ? 'active' : fight.phase;
    for (let i = 0; i < slots.length; i++) slots[i].seen = false;
    if (active) for (let shapeIndex = 0; shapeIndex < Math.min(2, cast.shapes?.length || 0); shapeIndex++) {
      const shape = cast.shapes[shapeIndex];
      if (!validShape(shape, kind)) continue;
      let slot = null;
      for (let i = 0; i < slots.length; i++) if (slots[i].active && slots[i].castId === cast.id
        && slots[i].shapeIndex === shapeIndex) { slot = slots[i]; break; }
      if (!slot) {
        for (let i = 0; i < slots.length; i++) if (!slots[i].visible) { slot = slots[i]; break; }
        if (!slot) for (let i = 0; i < slots.length; i++) if (!slots[i].active) { slot = slots[i]; break; }
        if (!slot) continue; // Decoration cannot evict a current authoritative active shape.
        slot.born = clock - age; slot.castId = cast.id; slot.shapeIndex = shapeIndex;
        slot.kind = kind; slot.mesh.geometry = kind === 0 ? g.jet : kind === 1 ? g.rake : g.ink;
      }
      slot.active = slot.visible = slot.seen = true; slot.progress = progress; slot.lastFlow = age;
      const retained = slot.shape; retained.kind = shape.kind;
      if (kind === 0) {
        retained.a.x = shape.a.x; retained.a.z = shape.a.z;
        retained.b.x = shape.b.x; retained.b.z = shape.b.z; retained.radius = shape.radius;
      } else {
        retained.x = shape.x; retained.z = shape.z; retained.heading = shape.heading;
        retained.inner = shape.inner; retained.outer = shape.outer; retained.halfAngle = shape.halfAngle;
      }
    }
    diagnostics.activeCount = diagnostics.releasingCount = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.active && !slot.seen) { slot.active = false; slot.releaseAt = clock; }
      if (!slot.visible) continue;
      const release = slot.active ? 0 : clamp((clock - slot.releaseAt) / RELEASE_SECONDS[slot.kind]);
      if (!slot.active && release >= 1) { slot.visible = slot.mesh.visible = false; slot.castId = null; continue; }
      slot.mesh.visible = true; project(slot, entity);
      const uniforms = slot.material.uniforms;
      uniforms.uKind.value = slot.kind;
      uniforms.uTime.value = slot.active ? slot.lastFlow
        : slot.lastFlow + RELEASE_SECONDS[slot.kind] * (release - .5 * release * release);
      uniforms.uMotion.value = reducedMotion ? 0 : 1;
      uniforms.uProgress.value = slot.progress;
      uniforms.uActive.value = slot.active ? 1 : 0;
      uniforms.uCoverage.value = slot.active ? .12 : 0;
      uniforms.uRelease.value = release;
      uniforms.uFlash.value = reducedFlash ? .27 : 1;
      uniforms.uOpacity.value = reducedFlash ? .82 : 1;
      if (slot.active) diagnostics.activeCount++; else diagnostics.releasingCount++;
    }
    const charge = fight.phase === 'tell' && beat ? smooth((fight.clock - cast.startedAt) / beat.tellTicks) : 0;
    const recovery = fight.phase === 'recovery' && fight.recovery;
    let recoveryGlow = 0;
    if (recovery) {
      const remaining = recovery.startedAt + recovery.durationTicks - fight.clock;
      recoveryGlow = smooth(remaining / 18);
    }
    aperture.visible = charge > .015 || !!active || recoveryGlow > .015;
    apertureMaterial.emissiveIntensity = (charge * .32 + (active ? .42 : 0) + recoveryGlow * 1.45)
      * (reducedFlash ? .32 : 1);
    diagnostics.aperture = recoveryGlow > .015 ? 'recovery' : charge > .015 ? 'charge' : active ? 'active' : 'off';
    return diagnostics;
  }

  // Optional world-origin hook: retained residue follows the same origin shift as live shapes.
  function rebase(dx, dz) {
    if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
    for (let i = 0; i < slots.length; i++) if (slots[i].visible) {
      const shape = slots[i].shape;
      shape.a.x -= dx; shape.a.z -= dz; shape.b.x -= dx; shape.b.z -= dz;
      shape.x -= dx; shape.z -= dz;
    }
  }

  function dispose() {
    if (disposed) return;
    clear(); disposed = true; diagnostics.disposed = true;
    for (let i = 0; i < slots.length; i++) slots[i].material.dispose();
    apertureMaterial.dispose(); group.removeFromParent(); aperture.removeFromParent();
  }
  return { group, aperture, update, clear, rebase, dispose, inspect: () => diagnostics };
}
