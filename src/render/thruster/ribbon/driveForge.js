/**
 * The drive FORGE — the steady mouth where the live plume begins.
 *
 * The forge is nozzle-local and belongs to the live engine, not to recorded history. It provides a
 * coaxial luminous collar so the plume visibly emerges from the bell at every camera angle. It has
 * no pulse clock and does not synchronize with the contrail: the contrail is immutable historical
 * light, while this is a steady source whose intensity follows the current drive envelope.
 */
import * as THREE from 'three';

/** Length of the collar in world units. Long enough to be a mouth, short enough not to be a jet. */
export const FORGE_LENGTH_WU = 5.4;
/** Mouth and aft radii as multiples of the throat radius. */
export const FORGE_MOUTH_SCALE = 0.94;
export const FORGE_AFT_SCALE = 1.52;
const RINGS = 14;
const SEGS = 28;

const FORGE_VERT = /* glsl */`
  precision highp float;

  attribute float aTube;

  uniform float uLength;
  uniform float uMouthRadius;
  uniform float uAftRadius;

  varying float vTube;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vTube = aTube;
    float radius = mix(uMouthRadius, uAftRadius, aTube);
    vec3 local = vec3(position.x * radius, position.y * radius, aTube * uLength);
    vec4 world = modelMatrix * vec4(local, 1.0);
    vWorldPos = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * vec3(position.x, position.y, 0.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FORGE_FRAG = /* glsl */`
  precision highp float;

  uniform vec3  uCoreColor;
  uniform vec3  uEdgeColor;
  uniform float uDrive;
  uniform float uBoost;
  uniform float uOpacity;
  uniform float uRadiance;
  uniform vec3  uCamPos;

  varying float vTube;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    vec3 V = normalize(uCamPos - vWorldPos);
    float facing = abs(dot(normalize(vNormal), V));
    float graze = clamp(1.0 - facing, 0.0, 1.0);
    float shell = 0.30 + pow(graze, 1.7) * 1.35;

    float lip = exp(-vTube * vTube * 58.0);
    float body = exp(-vTube * 2.35);

    float energy = (lip * 1.15 + body * 0.5) * (0.30 + uDrive * 0.95 + uBoost * 0.55);
    energy *= shell;

    vec3 col = mix(uEdgeColor, uCoreColor, clamp(lip * 1.25 + uBoost * 0.3, 0.0, 1.0));
    float alpha = clamp(energy * uOpacity, 0.0, 1.0);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * uRadiance * (0.6 + energy * 1.1), alpha);
  }
`;

function buildForgeGeometry(T) {
  const verts = (RINGS + 1) * (SEGS + 1);
  const position = new Float32Array(verts * 3);
  const tube = new Float32Array(verts);
  let v = 0;
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS;
    for (let s = 0; s <= SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      position[v * 3] = Math.cos(a);
      position[v * 3 + 1] = Math.sin(a);
      position[v * 3 + 2] = 0;
      tube[v] = t;
      v++;
    }
  }

  const quads = RINGS * SEGS;
  const index = new Uint16Array(quads * 6);
  let i = 0;
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = r * (SEGS + 1) + s;
      const b = a + 1;
      const c = a + (SEGS + 1);
      const d = c + 1;
      index[i++] = a; index[i++] = b; index[i++] = c;
      index[i++] = b; index[i++] = d; index[i++] = c;
    }
  }

  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(position, 3));
  geo.setAttribute('aTube', new T.BufferAttribute(tube, 1));
  geo.setIndex(new T.BufferAttribute(index, 1));
  return geo;
}

/** One steady forge. Sits at a nozzle and points along the direction the live plume leaves. */
export class DriveForge {
  constructor(T = THREE, opts = {}) {
    this.THREE = T;
    this.geometry = buildForgeGeometry(T);
    this.material = new T.ShaderMaterial({
      uniforms: {
        uLength: { value: opts.lengthWU != null ? opts.lengthWU : FORGE_LENGTH_WU },
        uMouthRadius: { value: 1.3 },
        uAftRadius: { value: 2.1 },
        uCoreColor: { value: new T.Color(1.0, 0.99, 0.97) },
        uEdgeColor: { value: new T.Color(0.16, 0.66, 1.0) },
        uDrive: { value: 0 },
        uBoost: { value: 0 },
        uOpacity: { value: 0.5 },
        uRadiance: { value: 2.05 },
        uCamPos: { value: new T.Vector3() },
      },
      vertexShader: FORGE_VERT,
      fragmentShader: FORGE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this._aim = new T.Vector3();
  }

  attach(parent) {
    if (parent && this.mesh.parent !== parent) parent.add(this.mesh);
  }

  setCamera(camera) {
    if (camera) this.material.uniforms.uCamPos.value.copy(camera.position);
  }

  /**
   * @param {{x:number,y:number,z:number,aftX?:number,aftY?:number,aftZ?:number}|null} nozzle where the bell is; its current aft axis is authoritative
   * @param {{x:number,y:number,z:number}|null} aft fallback direction for legacy callers only
   * @param {object} env current drive envelope; reads drive, boost and throatRadius
   */
  update(nozzle, aft, env) {
    if (!nozzle) {
      this.mesh.visible = false;
      return;
    }

    // A forge is the live mouth of the current thruster. It must follow the current nozzle axis,
    // never the tangent of recorded history. Pointing it at the history line recreates the false
    // visual attachment — a horse-tail connector that bends toward wherever the ship used to be.
    const hasNozzleAxis = Number.isFinite(nozzle.aftX)
      && Number.isFinite(nozzle.aftZ)
      && Math.hypot(nozzle.aftX, nozzle.aftY || 0, nozzle.aftZ) > 1e-6;
    const aimX = hasNozzleAxis ? nozzle.aftX : aft && aft.x;
    const aimY = hasNozzleAxis ? (nozzle.aftY || 0) : aft && aft.y;
    const aimZ = hasNozzleAxis ? nozzle.aftZ : aft && aft.z;
    const aimLen = Math.hypot(aimX || 0, aimY || 0, aimZ || 0);
    if (!(aimLen > 1e-6)) {
      this.mesh.visible = false;
      return;
    }

    const drive = Math.max(0, Math.min(1.4, (env && env.drive) || 0));
    const boost = Math.max(0, (env && env.boost) || 0);
    const u = this.material.uniforms;
    u.uDrive.value = drive;
    u.uBoost.value = boost;

    const throat = env && env.throatRadius != null ? env.throatRadius : 1.32;
    u.uMouthRadius.value = throat * FORGE_MOUTH_SCALE;
    u.uAftRadius.value = throat * FORGE_AFT_SCALE;

    this.mesh.position.set(nozzle.x, nozzle.y, nozzle.z);
    this._aim.set(
      nozzle.x + aimX / aimLen,
      nozzle.y + aimY / aimLen,
      nozzle.z + aimZ / aimLen,
    );
    this.mesh.lookAt(this._aim);
    this.mesh.updateMatrixWorld();
    this.mesh.visible = drive > 0.004;
  }

  inspect() {
    return {
      element: 'forge',
      construction: 'coaxial-collar',
      billboard: false,
      temporalModulation: false,
      aimSource: 'current-nozzle-axis',
      visible: !!this.mesh.visible,
      lengthWU: this.material.uniforms.uLength.value,
      mouthRadius: this.material.uniforms.uMouthRadius.value,
    };
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }
}

export const __testables = { buildForgeGeometry, RINGS, SEGS };
export default DriveForge;
