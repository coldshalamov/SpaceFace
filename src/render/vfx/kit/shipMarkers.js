// ShipMarkers — ships pop from the floor at a glance (readability for a dense Swarm fight).
//
// What a current top-down action game does for a crowd over a busy, lit floor: every unit sits on
// a soft dark contact pool that separates its silhouette from the ground, wears a thin team-colour
// ring of light at its feet, and the player's own ship has a distinct marker the eye finds first.
// All of it is drawn here as ONE instanced draw of flat quads on the play plane, below the hulls
// (depth-tested, so a hull always covers its own pool and ring).
//
//   pool    soft dark ellipse, ~1.8x hull radius, premultiplied darkening (no colour added)
//   ring    thin team-colour band at ~1.25x hull radius; hostiles get four broken arcs (they read
//           as "threat" at a glance), the player a full ring, neutrals a faint cool ring
//   chevron the player's heading mark, a short bright chevron just outside the ring
//
// Cost: one draw, <= 2 quads per ship (+1 for the player), CPU writes only live ships per frame.
import * as THREE from 'three';

export const MARKER_CAPACITY = 900;
const TYPE_POOL = 0;
const TYPE_RING_FULL = 1;
const TYPE_RING_THREAT = 2;
const TYPE_CHEVRON = 3;

const VERTEX = /* glsl */`
attribute vec4 mA; // centre xyz (local), half size (WU)
attribute vec4 mB; // colour rgb (HDR), type
attribute vec4 mC; // heading (rad), alpha, inner radius fraction, spin phase
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vType;
varying vec2 vParam;
void main(){
  float c=cos(mC.x),s=sin(mC.x);
  vec2 q=position.xy;
  vec2 r=vec2(q.x*c-q.y*s,q.x*s+q.y*c)*mA.w;
  vec3 world=mA.xyz+vec3(r.x,0.0,r.y);
  vUv=q;
  vColor=vec4(mB.rgb,mC.y);
  vType=mB.w;
  vParam=vec2(mC.z,mC.w);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
}`;

const FRAGMENT = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
varying float vType;
varying vec2 vParam;
void main(){
  float r=length(vUv);
  vec4 o=vec4(0.0);
  if(vType<0.5){
    // Contact pool: darkens what is under the ship, soft edge, no hard disc.
    float a=(1.0-smoothstep(0.25,1.0,r));
    a=a*a*vColor.a;
    o=vec4(0.0,0.0,0.0,a);
  }else if(vType<2.5){
    float ring=exp(-pow((r-0.86)*22.0,2.0));
    float w=fwidth(r)*1.5;
    ring=max(ring,(1.0-smoothstep(0.0,w,abs(r-0.86)-0.012))*0.8);
    if(vType>1.5){
      // Threat: four broken arcs, slowly turning.
      float ang=atan(vUv.y,vUv.x)+vParam.y;
      float seg=fract(ang/1.5707963);
      ring*=smoothstep(0.08,0.14,seg)*(1.0-smoothstep(0.62,0.68,seg));
    }
    o=vec4(vColor.rgb*ring*vColor.a,0.0);
  }else{
    // Chevron pointing +x (the quad is rotated to the heading).
    vec2 p=vUv;
    float d=abs(abs(p.y)*0.9-(0.55-p.x)*0.75);
    float arm=(1.0-smoothstep(0.05,0.12,d))*step(abs(p.y),0.6)*step(-0.2,p.x)*step(p.x,0.62);
    o=vec4(vColor.rgb*arm*vColor.a,0.0);
  }
  if(o.a<0.002&&max(o.r,max(o.g,o.b))<0.002)discard;
  gl_FragColor=o;
}`;

function quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function createMarkerMaterial() {
  return new THREE.ShaderMaterial({
    name: 'SF_Kit_ShipMarkers',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export const TEAM_COLORS = Object.freeze({
  player: [1.9, 1.45, 0.75],
  hostile: [2.1, 0.42, 0.26],
  neutral: [0.45, 0.85, 1.05],
});

export class ShipMarkers {
  constructor(scene, { capacity = MARKER_CAPACITY } = {}) {
    this.capacity = capacity;
    this.geometry = quad();
    this.a = new Float32Array(capacity * 4);
    this.b = new Float32Array(capacity * 4);
    this.c = new Float32Array(capacity * 4);
    this.attrA = new THREE.InstancedBufferAttribute(this.a, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrB = new THREE.InstancedBufferAttribute(this.b, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrC = new THREE.InstancedBufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('mA', this.attrA);
    this.geometry.setAttribute('mB', this.attrB);
    this.geometry.setAttribute('mC', this.attrC);
    this.material = createMarkerMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'SF_Kit_ShipMarkers';
    this.mesh.frustumCulled = false;
    // Before other transparent effects so sparks and fronts draw over the pools and rings.
    this.mesh.renderOrder = 2;
    this.geometry.instanceCount = 0;
    this.count = 0;
    this.local = { x: 0, z: 0 };
    if (scene && typeof scene.add === 'function') scene.add(this.mesh);
  }

  _push(x, y, z, half, rgb, type, heading, alpha, phase) {
    if (this.count >= this.capacity) return;
    const o = this.count * 4;
    this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; this.a[o + 3] = half;
    this.b[o] = rgb[0]; this.b[o + 1] = rgb[1]; this.b[o + 2] = rgb[2]; this.b[o + 3] = type;
    this.c[o] = heading; this.c[o + 1] = alpha; this.c[o + 2] = 0; this.c[o + 3] = phase;
    this.count++;
  }

  /**
   * Rebuild from live ships. `toLocal(x, z, out)` maps world to the render frame; when the ship's
   * own mesh is present its drawn position is used, so the pool never lags the hull.
   */
  update(state, toLocal, time = 0, reduced = false, playerHeading = null) {
    this.count = 0;
    const list = state && state.entityList;
    const playerId = state && state.playerId;
    const me = state && state.entities && state.entities.get ? state.entities.get(playerId) : null;
    const myTeam = me && me.team != null ? me.team : 1;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.alive === false || e.type !== 'ship' || !e.pos) continue;
        if (e.flags && e.flags.docked) continue;
        const view = e.mesh || e.view || null;
        if (view && view.visible === false) continue;
        let x; let z; let y = -1.2;
        if (view && view.position && view.parent && view.parent.isScene) { x = view.position.x; z = view.position.z; y = view.position.y - 1.2; }
        else { const l = toLocal(e.pos.x, e.pos.z, this.local); x = l.x; z = l.z; }
        const rad = Math.max(5, Math.min(60, Number.isFinite(e.radius) ? e.radius : 10));
        const isPlayer = e.id === playerId || e.isPlayer;
        const hostile = !isPlayer && e.team != null && e.team !== 0 && e.team !== myTeam;
        const rgb = isPlayer ? TEAM_COLORS.player : hostile ? TEAM_COLORS.hostile : TEAM_COLORS.neutral;
        const heading = isPlayer && Number.isFinite(playerHeading) ? playerHeading : (Number.isFinite(e.rot) ? e.rot : 0);
        this._push(x, y - 0.3, z, rad * 1.9, rgb, TYPE_POOL, 0, isPlayer ? 0.7 : 0.55, 0);
        const ringAlpha = isPlayer ? 0.95 : hostile ? 0.85 : 0.35;
        this._push(x, y, z, rad * 1.35, rgb, hostile ? TYPE_RING_THREAT : TYPE_RING_FULL, 0, ringAlpha,
          reduced ? 0 : time * 0.6 + (e.id % 7));
        if (isPlayer) this._push(x + Math.cos(heading) * rad * 1.75, y, z + Math.sin(heading) * rad * 1.75, rad * 0.55, rgb, TYPE_CHEVRON, heading, 1.1, 0);
      }
    }
    const n = Math.max(1, this.count) * 4;
    this.attrA.clearUpdateRanges(); this.attrA.addUpdateRange(0, n); this.attrA.needsUpdate = true;
    this.attrB.clearUpdateRanges(); this.attrB.addUpdateRange(0, n); this.attrB.needsUpdate = true;
    this.attrC.clearUpdateRanges(); this.attrC.addUpdateRange(0, n); this.attrC.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
    this.geometry.instanceCount = this.count;
    this.mesh.visible = this.count > 0;
    return this.count;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
