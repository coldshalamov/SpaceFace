// ShipMarkers — each ship's soft contact shadow (readability over a bright floor or nebula).
//
// OWNER 2026-11-23: no rings, arcs or chevrons around ships ("the weird Sonic rings around everything
// look like shit"). What stays is what a current top-down game keeps: a soft dark contact pool under
// every hull that separates its silhouette from what is behind it, adding no shape and no colour.
// The player's ship needs no marker (the camera keeps it at the centre of the frame); a ship's side
// and job read from its own hull lights and from the minimap.
// Drawn as ONE instanced draw of flat quads on the play plane, below the hulls (depth-tested, so a
// hull always covers its own pool). Cost: one draw, one quad per ship.
import * as THREE from 'three';
import { enemyJobFor } from '../../../data/enemyJobs.js';

export const MARKER_CAPACITY = 900;
const TYPE_POOL = 0;

const VERTEX = /* glsl */`
attribute vec4 mA; // centre xyz (local), half size (WU)
attribute vec4 mB; // colour rgb (HDR), type
attribute vec4 mC; // heading (rad), alpha, inner radius fraction, spin phase
uniform float uTime;
varying vec2 vUv;
varying vec4 vColor;
void main(){
  float c=cos(mC.x),s=sin(mC.x);
  vec2 q=position.xy;
  vec2 r=vec2(q.x*c-q.y*s,q.x*s+q.y*c)*mA.w;
  vec3 world=mA.xyz+vec3(r.x,0.0,r.y);
  vUv=q;
  vColor=vec4(mB.rgb,mC.y);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(world,1.0);
}`;

const FRAGMENT = /* glsl */`
varying vec2 vUv;
varying vec4 vColor;
void main(){
  // Contact pool: darkens what is under the ship, soft edge, no hard disc, no colour added.
  float r=length(vUv);
  float a=(1.0-smoothstep(0.25,1.0,r));
  a=a*a*vColor.a;
  if(a<0.002)discard;
  gl_FragColor=vec4(0.0,0.0,0.0,a);
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
   * own mesh is present its drawn position is used, so the pool never lags the hull. The trailing
   * parameters (reduced motion, player heading, HUD attention) are kept for the caller's signature;
   * a contact shadow does not depend on them.
   */
  update(state, toLocal, time = 0, reduced = false, playerHeading = null, attention = 'fight') { // eslint-disable-line no-unused-vars
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
        // The scanner's rule (systems/scannerReadModel.js isHostileToPlayer): team 2 is civilian
        // traffic and a passive actor is a lesson body; neither wears a threat ring. Every working
        // ship in the Helios harbour used to wear one, so the calm opening read as an ambush.
        const hostile = !isPlayer && e.team != null && e.team !== 0 && e.team !== 2 && e.team !== myTeam
          && !(e.data && e.data.ai && e.data.ai.passive === true);
        // OWNER 2026-11-23: no rings, arcs or chevrons drawn around ships, ever ("the weird Sonic
        // rings around everything look like shit"). The camera keeps the player's own ship at the
        // centre of the frame, so it needs no marker to be found; a ship's side and job read from
        // its own hull lights and the minimap. All that stays in the world is the soft dark contact
        // shadow, which only darkens what is under a hull so its silhouette separates from a bright
        // floor or nebula; it adds no shape and no colour of its own.
        if (isPlayer) {
          this._push(x, y - 0.3, z, rad * 1.9, TEAM_COLORS.player, TYPE_POOL, 0, 0.45, 0);
        } else if (hostile) {
          this._push(x, y - 0.3, z, rad * 1.9, TEAM_COLORS.hostile, TYPE_POOL, 0, jobStyleFor(e).pool * 0.8, 0);
        } else {
          this._push(x, y - 0.3, z, rad * 1.9, TEAM_COLORS.neutral, TYPE_POOL, 0, 0.3, 0);
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
