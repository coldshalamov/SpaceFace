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
import { enemyJobFor } from '../../../data/enemyJobs.js';

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
      // Threat ring: the enemy's JOB by shape (same language as the minimap glyphs).
      //  1 rush: 3 short arcs (fodder, faint)   2 burst: full ring, fast fuse blink
      //  3 reach: 2 bracket arcs                4 wall: heavy double ring
      //  5 skirmish: 2 swept arcs               6 deny: 4 arcs + a faint filled core
      //  (+10: a boss — the same job, with four command brackets outside it)
      //  7 seize: 2 arcs + inner ring           8 source: 8 dashes + outer ring
      float pat=vParam.x;
      float boss=step(9.5,pat);
      pat-=boss*10.0;
      float ang=atan(vUv.y,vUv.x)+vParam.y;
      float n=4.0, duty=0.55;
      if(pat<1.5&&pat>0.5){n=3.0;duty=0.32;}
      else if(pat<2.5&&pat>1.5){n=1.0;duty=1.0;}
      else if(pat<3.5&&pat>2.5){n=2.0;duty=0.28;}
      else if(pat<4.5&&pat>3.5){n=1.0;duty=1.0;}
      else if(pat<5.5&&pat>4.5){n=2.0;duty=0.3;}
      else if(pat<6.5&&pat>5.5){n=4.0;duty=0.55;}
      else if(pat<7.5&&pat>6.5){n=2.0;duty=0.6;}
      else if(pat>7.5){n=8.0;duty=0.6;}
      float seg=fract(ang*n/6.2831853);
      float on=duty>=1.0?1.0:smoothstep(0.0,0.04,seg)*(1.0-smoothstep(duty-0.04,duty,seg));
      ring*=on;
      if(pat>3.5&&pat<4.5) ring=max(ring,exp(-pow((r-0.74)*22.0,2.0))*0.9);
      if(pat>6.5&&pat<7.5) ring=max(ring,exp(-pow((r-0.55)*26.0,2.0))*0.8);
      if(pat>7.5) ring=max(ring,exp(-pow((r-0.97)*30.0,2.0)));
      if(pat>1.5&&pat<2.5) ring*=0.55+0.45*step(0.5,fract(uTime*3.0+vParam.y));
      if(pat>5.5&&pat<6.5) ring=max(ring,(1.0-smoothstep(0.0,0.5,r))*0.18);
      if(boss>0.5){
        float b=fract((atan(vUv.y,vUv.x)+0.7853982)/1.5707963);
        float bracket=exp(-pow((r-0.99)*30.0,2.0))*(1.0-smoothstep(0.1,0.16,abs(b-0.5)));
        ring=max(ring,bracket);
      }
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

// Job colours: the minimap's CONTACT_JOB_PALETTE (src/ui/map/tacticalMapGrammar.js) lifted to HDR.
const hexRgb = (h, k) => [((h >> 16) & 255) / 255 * k, ((h >> 8) & 255) / 255 * k, (h & 255) / 255 * k];
export const JOB_STYLE = Object.freeze({
  rush: { pat: 1, rgb: hexRgb(0xff4d3d, 1.6), alpha: 0.42, size: 1.15, pool: 0.35 },
  burst: { pat: 2, rgb: hexRgb(0xff9a2e, 2.0), alpha: 0.95, size: 1.3, pool: 0.5 },
  reach: { pat: 3, rgb: hexRgb(0xe26bff, 2.0), alpha: 0.95, size: 1.4, pool: 0.5 },
  wall: { pat: 4, rgb: hexRgb(0xffb4a2, 1.8), alpha: 0.9, size: 1.3, pool: 0.6 },
  skirmish: { pat: 5, rgb: hexRgb(0xff6fae, 2.0), alpha: 0.9, size: 1.35, pool: 0.5 },
  deny: { pat: 6, rgb: hexRgb(0x8f86ff, 2.0), alpha: 0.95, size: 1.4, pool: 0.5 },
  seize: { pat: 7, rgb: hexRgb(0xffe24f, 2.0), alpha: 0.95, size: 1.4, pool: 0.5 },
  source: { pat: 8, rgb: hexRgb(0xff2f6a, 2.2), alpha: 1.0, size: 1.3, pool: 0.65 },
});
const JOB_DEFAULT = Object.freeze({ pat: 5, rgb: [2.1, 0.42, 0.26], alpha: 0.85, size: 1.35, pool: 0.55 });

/** The marker style for an entity's combat job (null for non-combat ships). */
export function jobStyleFor(e) {
  const d = e && e.data;
  const job = (d && typeof d.combatJob === 'string' && d.combatJob)
    || (enemyJobFor(d && (d.enemyTypeId || d.lootTableId || d.archetypeId)) || {}).job;
  return (job && JOB_STYLE[job]) || JOB_DEFAULT;
}

/** A boss: drawn as its job, larger, with command brackets (the minimap's isBossContact rule). */
export function isBossShip(e) {
  const d = e && e.data;
  if (!d) return false;
  if (d.isBoss === true || d.encounterBoss != null || d.missionBoss != null) return true;
  const row = enemyJobFor(d.enemyTypeId || d.lootTableId || d.archetypeId);
  return !!(row && row.brain === 'tactical' && row.cost >= 16);
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

  _push(x, y, z, half, rgb, type, heading, alpha, phase, pattern = 0) {
    if (this.count >= this.capacity) return;
    const o = this.count * 4;
    this.a[o] = x; this.a[o + 1] = y; this.a[o + 2] = z; this.a[o + 3] = half;
    this.b[o] = rgb[0]; this.b[o + 1] = rgb[1]; this.b[o + 2] = rgb[2]; this.b[o + 3] = type;
    this.c[o] = heading; this.c[o + 1] = alpha; this.c[o + 2] = pattern; this.c[o + 3] = phase;
    this.count++;
  }

  /**
   * Rebuild from live ships. `toLocal(x, z, out)` maps world to the render frame; when the ship's
   * own mesh is present its drawn position is used, so the pool never lags the hull.
   */
  /**
   * @param {string} attention the HUD attention state ('fight' | 'teach' | 'calm'). In calm flight
   *   the player's ring fades out to a faint heading chevron: the ship is already easy to find.
   */
  update(state, toLocal, time = 0, reduced = false, playerHeading = null, attention = 'fight') {
    this.count = 0;
    const target = attention === 'calm' ? 0 : attention === 'teach' ? 0.6 : 1;
    const dt = Math.max(0, Math.min(0.1, time - (this._lastTime ?? time)));
    this._lastTime = time;
    this.playerVis = this.playerVis == null ? target : this.playerVis + (target - this.playerVis) * Math.min(1, dt * 3);
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
        const heading = isPlayer && Number.isFinite(playerHeading) ? playerHeading : (Number.isFinite(e.rot) ? e.rot : 0);
        const spin = reduced ? 0 : time * 0.6 + (e.id % 7);
        if (isPlayer) {
          const v = this.playerVis;
          if (v > 0.02) {
            this._push(x, y - 0.3, z, rad * 1.9, TEAM_COLORS.player, TYPE_POOL, 0, 0.7 * v, 0);
            this._push(x, y, z, rad * 1.35, TEAM_COLORS.player, TYPE_RING_FULL, 0, 0.95 * v, spin);
          }
          this._push(x + Math.cos(heading) * rad * 1.75, y, z + Math.sin(heading) * rad * 1.75, rad * 0.55, TEAM_COLORS.player, TYPE_CHEVRON, heading, 0.35 + 0.75 * v, 0);
        } else if (hostile) {
          const st = jobStyleFor(e);
          const boss = isBossShip(e);
          this._push(x, y - 0.3, z, rad * 1.9, st.rgb, TYPE_POOL, 0, st.pool, 0);
          this._push(x, y, z, rad * st.size * (boss ? 1.25 : 1), st.rgb, TYPE_RING_THREAT, 0, boss ? 1 : st.alpha, boss ? 0 : spin, st.pat + (boss ? 10 : 0));
        } else {
          this._push(x, y - 0.3, z, rad * 1.9, TEAM_COLORS.neutral, TYPE_POOL, 0, 0.45, 0);
          this._push(x, y, z, rad * 1.35, TEAM_COLORS.neutral, TYPE_RING_FULL, 0, 0.35, spin);
        }
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

  /** One hidden draw so the program links and the buffers upload before any fight. */
  warm() {
    this.count = 0;
    this._push(0, -5000, 0, 0.01, [0, 0, 0], 0, 0, 0, 0);
    this.attrA.needsUpdate = true; this.attrB.needsUpdate = true; this.attrC.needsUpdate = true;
    this.geometry.instanceCount = 1;
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
