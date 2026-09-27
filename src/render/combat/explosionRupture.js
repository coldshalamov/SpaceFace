import * as THREE from 'three';
import { explosionPattern01 } from './phasedExplosions.js';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { volatileClassOf } from '../../data/commodityVolatileClasses.js';
import {
  assertDynamicBufferOwnerWritable, commitDynamicBufferOwner, markDynamicBufferItems,
  registerDynamicBufferOwner, unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

// These are different material constructions, not palettes on the same radial blast.
export const RUPTURE_FAMILY = Object.freeze({ mineral: 0, armor: 1, reactor: 2, fuel: 3 });
const HANDLED_PHASES = new Set([
  'ignition', 'contact-compression', 'terrain-spall', 'collision-shear', 'kinetic-tear',
  'internal', 'internal-secondary', 'breakup', 'rupture', 'pressure', 'residue',
]);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

export function explosionRuptureFamily(entry) {
  if (entry.materialId === 'fuel') return 'fuel';
  if (entry.materialId === 'rock' || entry.materialId === 'ice') return 'mineral';
  const source = String(entry.sourceType || '').toLowerCase();
  if (source.includes('volatile') || source.includes('fuel')) return 'fuel';
  if (source.includes('asteroid') || source.includes('rock') || source.includes('mineral')) return 'mineral';
  if (entry.cause === 'kinetic' || entry.cause === 'terrain_collision' || entry.cause === 'ship_collision') return 'armor';
  if ((!source || source === 'unknown') && entry.cause === 'explosive') return 'fuel';
  return 'reactor';
}

/** Resolve the destroyed substance, never the material of the weapon that struck it. */
export function explosionSourceMaterial(receipt = {}, entity = null) {
  const source = receipt.entity || entity;
  const data = source?.data || receipt.data || {};
  const material = receipt.materialId || receipt.presentation?.materialId || data.materialId;
  if (material === 'fuel' || data.volatileClass === 'explosive'
    || volatileClassOf(data.commodityId || receipt.commodityId)?.id === 'explosive'
    || data.typeId === 'ast_gas_cloud') return 'fuel';
  if (material === 'rock' || material === 'ice' || material === 'hull' || material === 'armor') return material;
  const type = receipt.type || receipt.victimClass || source?.type;
  if (type === 'asteroid') return data.typeId === 'ast_icy' ? 'ice' : 'rock';
  if (type === 'ship' || type === 'drone' || type === 'station' || type === 'wreck') return 'hull';
  return 'unknown';
}

function ruptureAxis(entry) {
  if (entry.hasNormal && (entry.cause === 'terrain_collision' || entry.cause === 'ship_collision')) {
    let x = finite(entry.normalX), z = finite(entry.normalZ);
    if (x < -1e-8 || (Math.abs(x) <= 1e-8 && z < 0)) { x = -x; z = -z; }
    if (entry.cause === 'terrain_collision') {
      let into = x * finite(entry.targetVelocityX) + z * finite(entry.targetVelocityZ);
      if (Math.abs(into) <= 1e-8 && entry.hasDirection !== false) into = x * finite(entry.dirX) + z * finite(entry.dirZ);
      if (into > 1e-8) { x = -x; z = -z; }
    }
    if (Math.hypot(x, z) > 1e-8) return Math.atan2(z || 0, x || 0);
  }
  return Math.atan2(finite(entry.dirZ), finite(entry.dirX, 1));
}

// One continuous parameterized surface per instance. Curvature is true geometry in three axes:
// fractured wedges, longitudinal tears, open pressure bowls, and rolling flame scrolls.
// There is no sphere, camera-facing carrier, noise texture, or radial puff in this owner.
function createRuptureGeometry() {
  const positions = [], uvs = [], indices = [];
  const rows = 32, columns = 12;
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
    positions.push(i / rows, 0, j / columns * 2 - 1);
    uvs.push(i / rows, j / columns);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    const a = i * (columns + 1) + j, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.instanceCount = 0;
  geometry.name = 'SF_ExplosionRupture_continuous-material-sheet';
  return geometry;
}

const VERTEX = /* glsl */`
  attribute vec3 aOrigin;
  attribute vec4 aShape; // family, length, width, height
  attribute vec4 aPhase; // age, lifetime, seed, motion scale
  attribute vec4 aMotion; // angle, speed, inherited x, inherited z
  attribute vec2 aAppearance; // alpha, heat multiplier
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec4 vPhase;
  varying vec2 vAppearance;
  varying float vKind;
  void main() {
    float age = aPhase.x;
    float t = clamp(age/aPhase.y,0.0,1.0);
    float seed = aPhase.z*6.283185;
    float motion = aPhase.w;
    float u = uv.x, v = uv.y*2.0-1.0;
    float opening = 0.12 + 0.88*(1.0-exp(-age*11.0));
    float advection = age*motion;
    float taper = pow(max(0.0,1.0-u),0.45);
    vec3 p;
    if(aShape.x < 0.5) {
      // A mineral fracture opens into a fan of broad angular facets. Its travelling fracture
      // fronts peel the individual laminae, leaving the actual opaque chips to the debris owner.
      float facet = abs(v+0.20*sin(u*5.0+seed));
      p.x = u*aShape.y*opening;
      p.z = v*aShape.z*(0.22+0.78*sin(u*2.8))*taper;
      p.y = (0.12 + facet*0.7 + u*u*0.48)*aShape.w;
      p.y += sin(u*7.0+seed-advection*3.0)*aShape.w*0.09;
    } else if(aShape.x < 1.5) {
      // A breach is a long throat with two ragged lips, never a round orange flare.
      float bow = sin(u*3.141593);
      p.x = u*aShape.y*opening;
      p.z = v*aShape.z*taper*(0.38+0.62*bow);
      p.z += sin(u*2.7+seed)*aShape.z*u*0.32;
      p.y = (v*v*0.72 + bow*0.30)*aShape.w;
      p.y += sin(u*8.0-seed-advection*8.0)*aShape.w*bow*0.14;
      p.y += sin(u*19.0+v*4.0-seed-advection*12.0)*aShape.w*bow*0.10;
      p.z += sin(u*13.0-v*3.0+seed-advection*7.0)*aShape.z*bow*0.13;
    } else if(aShape.x < 2.5) {
      // Open, anisotropic pressure cavity. u goes around a PARTIAL rim and v crosses its
      // section; the throat remains empty, and uneven lobes lean in different directions.
      float theta = (u-0.5)*(1.7+0.4*sin(seed));
      float lip = 0.56 + 0.44*v;
      float radius = aShape.y*(0.38+0.62*opening)*(0.76+0.18*sin(u*7.0+seed));
      p.x = cos(theta)*(radius+v*aShape.z*0.38);
      p.z = sin(theta)*(radius+v*aShape.z*0.38)*0.78;
      p.y = aShape.w*(lip*lip+0.17*sin(u*6.0+seed-advection*4.0))*opening;
      p.x += sin(u*5.0+seed-advection*3.0)*aShape.z*0.09;
    } else {
      // Flame is a rolling scroll: the hot edge curls OVER the dark folded body while
      // longitudinal fuel tongues separate. The cross-section changes through the lifetime.
      float roll = (v+1.0)*(1.08+advection*1.1) + u*0.8 + sin(seed)*0.3;
      float breadth = aShape.z*(0.36+0.64*sin(u*2.6))*taper;
      p.x = u*aShape.y*opening;
      p.z = sin(roll)*breadth + sin(u*3.1+seed-advection*2.0)*aShape.z*u*0.24;
      p.y = (1.0-cos(roll))*breadth*0.64 + u*aShape.w*opening;
      p.y += sin(u*7.0-v*2.0+seed-advection*5.5)*aShape.w*0.12;
      p.y += sin(u*18.0+v*6.0-seed-advection*9.0)*aShape.w*taper*0.17;
      p.z += sin(u*14.0-v*5.0+seed-advection*8.0)*breadth*0.17;
    }
    // Pressure loses acceleration before it loses matter. Drift uses an analytic drag
    // integral, so frame cadence and pause never change a parcel's trajectory.
    float drift = (1.0-exp(-age*2.6))/2.6*motion;
    p.x += aMotion.y*drift;
    float c=cos(aMotion.x), s=sin(aMotion.x);
    vec3 posed=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z);
    posed.xz += aMotion.zw*age*0.12*motion;
    vec4 world=modelMatrix*vec4(aOrigin+posed,1.0);
    vWorld=world.xyz; vUv=uv; vPhase=aPhase; vKind=aShape.x; vAppearance=aAppearance;
    gl_Position=projectionMatrix*viewMatrix*world;
  }
`;

const FRAGMENT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec4 vPhase;
  varying vec2 vAppearance;
  varying float vKind;
  void main() {
    float age=vPhase.x, t=clamp(age/vPhase.y,0.0,1.0), seed=vPhase.z*6.283185;
    float u=vUv.x, v=vUv.y*2.0-1.0;
    float motionTime=age*vPhase.w;
    // Unequal macroscopic tears are contours, not a tiled noise mask. Both edges are
    // analytically filtered; zooming out preserves their energy without pixel glitter.
    float edge=0.84+0.09*sin(u*16.0+seed)+0.05*sin(u*29.0-seed*1.7);
    float crossEdge=edge-abs(v);
    float aa=max(0.012,fwidth(crossEdge)*1.25);
    float coverage=smoothstep(-aa,aa,crossEdge);
    // Advected folds split the carrier into three unequal fuel channels. The two travelling
    // scales roll together, open holes, and pinch apart into detached reaches; no intact silk
    // leaf survives underneath. All contours are continuous and filtered in screen space.
    float q=u-motionTime*(vKind>2.5?0.61:0.86);
    float spine=0.31*sin(q*11.0+seed)+0.10*sin(q*27.0-seed*1.3);
    float breadth=0.20+0.065*sin(q*17.0+seed);
    float mainCell=exp(-pow((v-spine)/breadth,2.0))*(0.71+0.29*sin(q*24.0+seed));
    float sideA=exp(-pow((v+0.52-0.19*sin(q*15.0-seed))/0.17,2.0))
      *(0.48+0.46*sin(q*19.0+1.2+seed));
    float sideB=exp(-pow((v-0.48-0.16*sin(q*18.0+seed))/0.20,2.0))
      *(0.45+0.42*sin(q*23.0-0.6-seed));
    float density=max(mainCell,max(sideA,sideB));
    float dissolution=0.12+0.31*smoothstep(0.30,0.94,t);
    float densityAA=max(0.045,fwidth(density)*1.3);
    float cells=smoothstep(dissolution-densityAA,dissolution+densityAA,density);
    float depth=1.0-exp(-density*1.9);
    if(vKind>0.5) coverage*=cells*depth;
    float root=smoothstep(0.0,0.055,u);
    float tip=1.0-smoothstep(0.89,1.0,u);
    float tear=(0.27+0.13*sin(u*8.0+seed-motionTime*1.1));
    float slit=abs(v-0.34*sin(u*7.0+seed));
    // The cavity must keep a substantial dark body between hot lips. Flame tears open
    // later; mineral sheets split almost immediately into a fractured fan.
    float tearAge=smoothstep(vKind<0.5?0.08:0.3,0.95,t);
    float tearCut=smoothstep(tear-0.035,tear+0.035,slit);
    coverage*=mix(1.0,tearCut,tearAge*0.88);
    float erosion=1.0-smoothstep(0.58+0.16*sin(u*6.0+seed),1.0,t);
    float onset=smoothstep(0.0,0.045,age);
    float end=1.0-smoothstep(0.78,1.0,t);
    float alpha=coverage*root*tip*erosion*onset*end*vAppearance.x;
    if(alpha<0.003) discard;
    vec3 normal=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
    float facing=abs(dot(normal,normalize(cameraPosition-vWorld)));
    float light=0.28+0.72*abs(dot(normal,normalize(vec3(-0.5,0.82,0.31))));
    float rimWidth=max(0.05,fwidth(crossEdge)*1.5);
    float rim=exp(-pow(crossEdge/rimWidth,2.0))*min(1.0,0.05/rimWidth);
    float cellRim=exp(-pow((density-dissolution-0.08)/max(0.10,densityAA),2.0));
    float fold=v-0.30*sin(u*6.0+seed-motionTime*5.0);
    float foldWidth=max(0.16,fwidth(fold)*1.3);
    float foldFire=exp(-pow(fold/foldWidth,2.0));
    float heat=(1.0-smoothstep(0.12,0.86,t))*vAppearance.y;
    float carriedHeat=0.40+0.60*pow(max(0.0,sin(q*12.0+seed+v*2.3)),2.0);
    float front=exp(-pow((u-(0.12+0.77*(1.0-exp(-age*7.0))))/0.17,2.0));
    vec3 cold, hot;
    float surfaceHeat;
    if(vKind<0.5) {
      cold=vec3(0.20,0.18,0.13)*light;
      hot=vec3(2.7,1.5,0.52);
      surfaceHeat=heat*(rim*0.72+front*0.38);
    } else if(vKind<1.5) {
      cold=vec3(0.055,0.070,0.083)*light;
      hot=vec3(5.6,2.2,0.48);
      surfaceHeat=heat*carriedHeat*(rim*0.50+cellRim*0.80+foldFire*0.18+front*0.30);
    } else if(vKind<2.5) {
      cold=vec3(0.022,0.065,0.10)*light;
      hot=vec3(1.5,3.7,5.2);
      surfaceHeat=heat*carriedHeat*(rim*0.38+cellRim*0.66+foldFire*0.18+front*0.22);
    } else {
      cold=vec3(0.065,0.018,0.009)*light;
      hot=vec3(4.1,1.5,0.20);
      // Combustion radiates through the fuel inside each folded tongue. Rim-only light
      // reads as electrical wire; optical thickness gives flame a hot, uneven interior
      // that cools toward its tips while the surrounding cavities stay transparent.
      float opticalBody=1.0-exp(-max(0.0,density-dissolution)*3.8);
      float fuelHeat=opticalBody*(0.35+0.65*carriedHeat)*(1.0-u*0.58);
      surfaceHeat=heat*(fuelHeat*0.92+carriedHeat*(rim*0.30+cellRim*0.38+front*0.24));
    }
    vec3 radiance=cold+hot*surfaceHeat;
    radiance+=vec3(2.1,1.65,1.15)*pow(max(0.0,surfaceHeat-0.55),2.0);
    alpha*=0.74+0.26*(1.0-facing);
    gl_FragColor=vec4(radiance,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ExplosionRupture {
  constructor(scene, { capacity = 96, localize = null } = {}) {
    this.capacity = Math.max(8, Math.floor(capacity));
    this.time = 0;
    this.localize = localize;
    this.scratch = { x: 0, z: 0 };
    this.activeCount = 0;
    this.dirty = false;
    this.disposed = false;
    this.records = Array.from({ length: this.capacity }, () => ({ alive: false }));
    const geometry = createRuptureGeometry();
    this.attributes = [3, 4, 4, 4, 2].map(size =>
      new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size).setUsage(THREE.DynamicDrawUsage));
    const names = ['aOrigin', 'aShape', 'aPhase', 'aMotion', 'aAppearance'];
    for (let i = 0; i < names.length; i++) geometry.setAttribute(names[i], this.attributes[i]);
    const material = new THREE.ShaderMaterial({
      name: 'SF_ExplosionRupture_material-transport', vertexShader: VERTEX, fragmentShader: FRAGMENT,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      forceSinglePass: true, blending: THREE.NormalBlending, toneMapped: false,
    });
    material.userData.spacefaceTransientTechnique = 'causal-rupture-sheets';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'SF_VFX_explosion_rupture';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.visible = false;
    this.roots = [this.mesh];
    scene.add(this.mesh);
    this.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
      id: 'explosion-rupture-sheets', mesh: this.mesh,
      attributes: this.attributes.map((attribute, i) => ({ name: names[i], attribute })),
    });
  }

  /** Called by the existing phased explosion scheduler; does not invent simulation events. */
  emitPhase(phase, entry, settings) {
    if (this.disposed || !entry || !HANDLED_PHASES.has(phase)) return false;
    const family = explosionRuptureFamily(entry), kind = RUPTURE_FAMILY[family];
    const sourceRadius = Math.max(2, finite(entry.radius, 8));
    // Capital scale comes from separated source zones and secondary failures. A single flame
    // tongue or piece of material must not become a hundred-unit sheet covering the camera.
    const r = Math.min(sourceRadius, 8 + Math.sqrt(sourceRadius) * 2.4);
    if (settings) this.settings = settings;
    const count = phase === 'rupture' ? (kind === 0 ? 7 : kind === 2 ? 4 : 5)
      : phase === 'ignition' ? (kind === 2 ? 2 : 3)
      : phase === 'residue' ? (kind === 0 ? 2 : 3)
      : phase === 'pressure' ? (kind === 2 ? 2 : 0)
      : phase === 'terrain-spall' || phase === 'kinetic-tear' ? 4 : 2;
    const radiusScale = entry.classId === 'capital' ? 1.12 : 1;
    const axis = ruptureAxis(entry);
    const residual = phase === 'residue';
    this.scratch.x = finite(entry.x); this.scratch.z = finite(entry.z);
    if (this.localize) this.localize(this.scratch.x, this.scratch.z, this.scratch);
    for (let i = 0; i < count; i++) {
      const seed = explosionPattern01(entry.serial, phase, i, 44);
      const pick = explosionPattern01(entry.serial, phase, i, 45);
      const side = i % 2 ? 1 : -1;
      const primary = phase === 'rupture' || phase === 'kinetic-tear';
      // Reactor alternates the pressure cavity with long plasma tongues. Their topology,
      // offset, and time separate; there is no central luminous sphere to flatten the read.
      const shapeKind = kind === 2 && ((phase === 'rupture' && i > 1) || phase.includes('internal')) ? 1 : kind;
      const phaseReach = phase === 'ignition' ? 0.58 : primary ? 1.8 : residual ? 1.3 : 1.0;
      const spread = kind === 1 ? 0.44 : kind === 0 ? 1.75 : kind === 2 ? 5.8 : 2.3;
      let angle = axis + ((i + 0.5) / Math.max(1, count) - 0.5) * spread + (seed - 0.5) * 0.34;
      if (phase === 'internal-secondary') angle += 1.4;
      if (entry.cause === 'ship_collision' && kind === 1 && i % 2) angle += Math.PI;
      let rec = this.records.find(row => !row.alive);
      if (!rec) break; // preserves admitted choreography rather than recycling live sheets
      Object.assign(rec, {
        alive: true, family, phase, serial: entry.serial, born: this.time + i * (residual ? 0.028 : 0.008),
        life: (kind === 0 ? 0.72 : kind === 1 ? 0.58 : kind === 2 ? 0.92 : 1.05)
          * (residual ? 1.7 : 1) * (0.84 + pick * 0.34),
        x: this.scratch.x + Math.cos(axis + Math.PI * 0.5) * side * sourceRadius * (phase.includes('internal') ? 0.30 : 0.08),
        y: 0.22 + i * r * 0.018,
        z: this.scratch.z + Math.sin(axis + Math.PI * 0.5) * side * sourceRadius * (phase.includes('internal') ? 0.30 : 0.08),
        kind: shapeKind, length: r * phaseReach * radiusScale * (0.72 + seed * 0.55),
        width: r * (kind === 0 ? 0.23 : kind === 1 ? 0.24 : kind === 2 ? 0.40 : 0.46) * (0.8 + pick * 0.4),
        height: r * (kind === 0 ? 0.16 : kind === 1 ? 0.27 : kind === 2 ? 0.62 : 0.38),
        angle, speed: r * (primary ? 1.7 : residual ? 0.6 : 0.45) * (0.7 + pick * 0.6),
        vx: finite(entry.targetVelocityX), vz: finite(entry.targetVelocityZ),
        seed, motion: 1, alpha: residual ? 0.38 : 0.80,
        heat: residual ? 0.09 : phase === 'ignition' ? 1.2 : 0.85,
      });
      this.activeCount++;
    }
    this.dirty = true;
    return true;
  }

  update(simTime, settings) {
    if (this.disposed) return;
    const next = finite(simTime, this.time);
    if (next < this.time - 1e-8) { this.clear(); this.time = next; return; }
    if (settings && settings !== this.settings) { this.settings = settings; this.dirty = true; }
    const profileId = resolveVfxAccessibilityProfile(this.settings).id;
    if (profileId !== this.profileId) { this.profileId = profileId; this.dirty = true; }
    if (next === this.time && !this.dirty) return;
    this.time = next;
    if (!this.activeCount && !this.dirty) return;
    this._publish(settings);
  }

  _publish(settings) {
    assertDynamicBufferOwnerWritable(this.dynamicBufferOwner);
    const profile = resolveVfxAccessibilityProfile(settings || this.settings);
    const motionScale = (settings || this.settings)?.video?.motionReduce ? 0.24 : 1;
    const [origin, shape, phase, motion, appearance] = this.attributes;
    let count = 0;
    for (const rec of this.records) {
      if (!rec.alive) continue;
      const age = this.time - rec.born;
      if (age >= rec.life) { rec.alive = false; this.activeCount--; continue; }
      if (age < 0) continue;
      origin.setXYZ(count, rec.x, rec.y, rec.z);
      shape.setXYZW(count, rec.kind, rec.length, rec.width, rec.height);
      phase.setXYZW(count, age, rec.life, rec.seed, rec.motion * motionScale);
      motion.setXYZW(count, rec.angle, rec.speed, rec.vx, rec.vz);
      appearance.setXY(count, rec.alpha * profile.flashOpacityScale, rec.heat);
      count++;
    }
    for (let i = 0; i < this.attributes.length; i++) markDynamicBufferItems(this.dynamicBufferOwner, i, 0, count);
    commitDynamicBufferOwner(this.dynamicBufferOwner, count);
    if (!this.dynamicBufferOwner) for (const attribute of this.attributes) attribute.needsUpdate = true;
    this.mesh.geometry.instanceCount = count;
    this.mesh.visible = count > 0;
    this.dirty = false;
  }

  reproject(dx, dz) {
    if (this.disposed || !this.activeCount) return;
    for (const rec of this.records) if (rec.alive) { rec.x += finite(dx); rec.z += finite(dz); }
    this.dirty = true;
    this._publish();
  }

  clear() {
    for (const rec of this.records) rec.alive = false;
    this.activeCount = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
    this.dirty = false;
    commitDynamicBufferOwner(this.dynamicBufferOwner, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    unregisterDynamicBufferOwner(this.dynamicBufferOwner);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
