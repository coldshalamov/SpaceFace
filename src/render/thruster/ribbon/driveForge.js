/**
 * The drive FORGE — the mouth the worldline is drawn out of.
 *
 * WHY THIS EXISTS
 * ---------------
 * The contrail is a history of where the thruster was, and a history has to start somewhere you can
 * see. Without a source it begins at an arbitrary point in empty space: flying straight that reads
 * as merely abrupt, but in a hard turn the line leaves at an angle to the hull and appears to come
 * out of flat nothing beside the ship.
 *
 * WHY NOT JUST BRIGHTEN THE THROAT LAMP
 * -------------------------------------
 * The throat glow in `plasmaStream.js` is a camera-facing disc, and it is deliberately dim — it was
 * turned down because at strength it "read as a hard grey-blue ball stuck on the back of the hull".
 * That is not a tuning accident, it is what a billboard does. A disc that always faces the camera
 * has no relationship to the direction the line leaves in, so it can only ever be a bright spot NEAR
 * the line, never the thing the line comes OUT of. Scaling it up buys a bigger ball.
 *
 * WHAT THIS IS INSTEAD
 * --------------------
 * A short flared collar, coaxial with the line's own heading, sitting at the bell: a muzzle the line
 * is extruded through. Because it is built around the line's axis rather than the camera's, the line
 * threads it at every attitude, and a hard turn swings the mouth with the line instead of leaving it
 * behind. Seen from astern it is an iris; seen side-on it is a lit slot. Both are a mouth.
 *
 * AND IT SHARES THE ENGINE'S CLOCK
 * --------------------------------
 * The forge flashes on exactly the pulse that the contrail stamps its shed bands with, at the same
 * rate and in the same phase. So a pulse is seen to fire at the mouth and then seen travelling away
 * as a band on the line, and the two elements read as one event with a cause rather than as a glow
 * that happens to sit near a ribbon. That shared clock is the whole join.
 */
import * as THREE from 'three';

/** Length of the collar in world units. Long enough to be a mouth, short enough not to be a jet. */
export const FORGE_LENGTH_WU = 5.4;
/** Mouth and aft radii, as multiples of the throat radius. Flares back to meet the line's width. */
export const FORGE_MOUTH_SCALE = 0.94;
export const FORGE_AFT_SCALE = 1.52;
/** Rings along the collar, and segments around it. */
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
    // position.xy carries the unit ring direction; the profile is applied here so radius and length
    // are live uniforms rather than baked, and one geometry serves every drive state.
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
  uniform float uFlash;
  uniform vec3  uCamPos;

  varying float vTube;
  varying vec3  vWorldPos;
  varying vec3  vNormal;

  void main() {
    // Grazing gain. A shell lit only by its own emission reads as a solid cone head-on; weighting the
    // rim is what makes it a mouth with a hole in it rather than a plug.
    vec3 V = normalize(uCamPos - vWorldPos);
    float facing = abs(dot(normalize(vNormal), V));
    float graze = clamp(1.0 - facing, 0.0, 1.0);
    float shell = 0.30 + pow(graze, 1.7) * 1.35;

    // The lip is the aperture itself: a tight band at the mouth. The body falls away aft so the
    // collar hands off to the line instead of ending on an edge.
    float lip = exp(-vTube * vTube * 58.0);
    float body = exp(-vTube * 2.35);

    float energy = (lip * 1.15 + body * 0.5) * (0.30 + uDrive * 0.95 + uBoost * 0.55);
    energy *= uFlash;
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
      const dd = c + 1;
      index[i++] = a; index[i++] = b; index[i++] = c;
      index[i++] = b; index[i++] = dd; index[i++] = c;
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(position, 3));
  geo.setAttribute('aTube', new T.BufferAttribute(tube, 1));
  geo.setIndex(new T.BufferAttribute(index, 1));
  return geo;
}

/**
 * One forge. Sits at a nozzle and points along the direction that nozzle's line leaves in.
 */
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
        uFlash: { value: 1 },
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
   * @param {{x:number,y:number,z:number}|null} nozzle where the bell is
   * @param {{x:number,y:number,z:number}|null} aft unit direction the LINE leaves in (not the hull's
   *   pointing — the mouth follows the line so the two never come apart in a turn)
   * @param {object} env drive envelope; reads drive, boost, throatRadius
   * @param {number} flash 0..1+ pulse gain, shared with the contrail's shed bands
   */
  update(nozzle, aft, env, flash) {
    if (!nozzle || !aft) {
      this.mesh.visible = false;
      return;
    }
    const drive = Math.max(0, Math.min(1.4, (env && env.drive) || 0));
    const boost = Math.max(0, (env && env.boost) || 0);
    const u = this.material.uniforms;
    u.uDrive.value = drive;
    u.uBoost.value = boost;
    u.uFlash.value = flash != null ? flash : 1;

    const throat = env && env.throatRadius != null ? env.throatRadius : 1.32;
    u.uMouthRadius.value = throat * FORGE_MOUTH_SCALE;
    u.uAftRadius.value = throat * FORGE_AFT_SCALE;

    this.mesh.position.set(nozzle.x, nozzle.y, nozzle.z);
    // Local +Z runs down the collar, so aiming +Z along the aft direction lays the mouth on the bell
    // and the flare on the line.
    this._aim.set(nozzle.x + aft.x, nozzle.y + aft.y, nozzle.z + aft.z);
    this.mesh.lookAt(this._aim);
    this.mesh.updateMatrixWorld();
    this.mesh.visible = drive > 0.004;
  }

  inspect() {
    return {
      element: 'forge',
      construction: 'coaxial-collar',
      billboard: false,
      visible: !!this.mesh.visible,
      lengthWU: this.material.uniforms.uLength.value,
      mouthRadius: this.material.uniforms.uMouthRadius.value,
      flash: this.material.uniforms.uFlash.value,
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
