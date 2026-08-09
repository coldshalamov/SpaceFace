// VFX NEXT — solid substrates: ballistic debris and oriented shock fronts.
//
// These are the two substrates that carry *physicality* rather than energy. Sparks and flashes tell
// you something happened; debris and a compression front tell you which way and how hard.
//
// DEBRIS is deliberately NOT emissive. design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md §4 puts fragments
// in the "industrial solid" role: they read by silhouette, tumble and lit form, which is also why
// they survive the bloom-off and grayscale review cells. A glowing fragment is a spark; a lit one
// is a piece of a ship. The distinction is most of what "more physical" means in the acceptance.
//
// FRONTS are axis-oriented mesh discs, not billboards. Orientation is the whole point: a shock disc
// that always faces the camera cannot express "normal to the force path", so concussion, repulsor
// and reentry would all collapse into the same round flash — which is the brief's failure mode
// "same visual language for unrelated phenomena", stated exactly.

import * as THREE from 'three';
import { GpuAgedSubstrate } from './gpuAged.js';
import { hash01 } from './force.js';

const DEBRIS_VERT = /* glsl */`
  uniform float uTime;
  uniform float uSizeScale;

  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute vec3 aAccel;
  attribute vec2 aTime;
  attribute vec2 aSize;
  attribute vec3 aColorA;
  attribute vec3 aColorB;
  attribute vec4 aParams;  // x = shapeVariant, y = seed, z = spinRate, w = drag
  attribute vec3 aAxis;    // spin axis

  varying vec3  vNormal;
  varying vec3  vColor;
  varying float vAge;
  varying float vAlpha;
  varying vec3  vWorld;

  float tauOf(float t, float k) { return k < 1e-4 ? t : (1.0 - exp(-k * t)) / k; }

  mat3 axisAngle(vec3 a, float ang) {
    float c = cos(ang), s = sin(ang), ic = 1.0 - c;
    return mat3(
      c + a.x*a.x*ic,       a.x*a.y*ic - a.z*s,  a.x*a.z*ic + a.y*s,
      a.y*a.x*ic + a.z*s,   c + a.y*a.y*ic,      a.y*a.z*ic - a.x*s,
      a.z*a.x*ic - a.y*s,   a.z*a.y*ic + a.x*s,  c + a.z*a.z*ic
    );
  }

  void main() {
    float life = max(aTime.y, 1e-4);
    float t = uTime - aTime.x;
    float age = t / life;
    vAge = age;
    if (age < 0.0 || age > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAlpha = 0.0; return; }
    vAlpha = 1.0;

    // Tumble. A fragment that does not rotate reads as a sprite no matter how good its silhouette
    // is; spin rate is scaled from the impulse that threw it, so a harder hit tumbles faster.
    mat3 rot = axisAngle(normalize(aAxis + vec3(1e-5)), aParams.z * t);

    // Deterministic per-instance shape jitter — one geometry, many silhouettes, zero extra draws.
    float sv = aParams.y;
    vec3 jitter = vec3(
      sin(sv * 12.9898 + position.y * 4.0),
      sin(sv * 78.233  + position.z * 4.0),
      sin(sv * 37.719  + position.x * 4.0)
    ) * 0.22;

    float size = mix(aSize.x, aSize.y, age) * uSizeScale;
    vec3 local = rot * ((position + jitter * length(position)) * size);
    vec3 wp = aOrigin + aVel * tauOf(t, aParams.w) + 0.5 * aAccel * t * t + local;

    vNormal = normalize(rot * normal);
    vWorld = wp;
    vColor = mix(aColorA, aColorB, age);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const DEBRIS_FRAG = /* glsl */`
  varying vec3  vNormal;
  varying vec3  vColor;
  varying float vAge;
  varying float vAlpha;
  varying vec3  vWorld;

  uniform vec3  uKeyDir;
  uniform vec3  uKeyColor;
  uniform vec3  uFillColor;
  uniform float uHeat;      // 0..1 — how much residual heat this batch carries
  uniform vec3  uHeatColor;

  void main() {
    if (vAlpha <= 0.0) discard;
    vec3 n = normalize(vNormal);
    float key  = max(0.0, dot(n, normalize(uKeyDir)));
    float fill = 0.5 + 0.5 * dot(n, vec3(0.0, 1.0, 0.0));
    vec3 lit = vColor * (uKeyColor * key + uFillColor * fill * 0.55);

    // Rim keeps the silhouette alive against a bright background — the brief's "dark effects
    // disappearing against dark environments" has an inverse, and unlit debris hits it.
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(0.0, dot(n, v)), 2.5);
    lit += uKeyColor * rim * 0.35;

    // Cooling: hot fragments glow at the fracture then fade to plain material FAST. The exponent is
    // load-bearing — a slow cool leaves every fragment tinted for its whole life, which turns the
    // industrial-solid role back into an emissive one and costs the family its physicality.
    float heat = uHeat * pow(max(0.0, 1.0 - vAge * 4.0), 3.0);
    lit += uHeatColor * heat;

    float a = 1.0 - smoothstep(0.75, 1.0, vAge);
    if (a <= 0.01) discard;
    gl_FragColor = vec4(lit, a);
  }
`;

/** Small angular chunk. Deterministically jittered icosahedron — flat-shaded so every facet catches
 *  the key light differently as it tumbles, which is what sells "a piece broke off something". */
function chunkGeometry(seed = 7) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const s = 0.62 + hash01(seed, i) * 0.76;
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s * 0.78, pos.getZ(i) * s * 1.18);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
  return g;
}

export function createDebrisSubstrate(capacity = 384) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSizeScale: { value: 1 },
      uKeyDir: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
      uKeyColor: { value: new THREE.Color(0xfff0d8) },
      uFillColor: { value: new THREE.Color(0x2b3d5c) },
      uHeat: { value: 0.22 },
      uHeatColor: { value: new THREE.Color(0xff5a1e) },
    },
    vertexShader: DEBRIS_VERT,
    fragmentShader: DEBRIS_FRAG,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const sub = new GpuAgedSubstrate({
    name: 'debris', capacity, geometry: chunkGeometry(), material,
  });
  sub.mesh.renderOrder = 5; // opaque-ish: draws before the additive energy layers
  return sub;
}

// ---------------------------------------------------------------------------------------------
// Shock fronts
// ---------------------------------------------------------------------------------------------

const FRONT_VERT = /* glsl */`
  uniform float uTime;
  uniform float uSizeScale;

  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute vec3 aAccel;
  attribute vec2 aTime;
  attribute vec2 aSize;   // x = radius at birth, y = radius at death
  attribute vec3 aColorA;
  attribute vec3 aColorB;
  attribute vec4 aParams; // x = coneCos (-1 = full disc), y = seed, z = thickness, w = mode
  attribute vec3 aAxis;   // front normal — the force path

  varying float vAcross;   // 0 at the inner rim, 1 at the outer rim — computed, NOT from uv
  varying vec3  vColor;
  varying float vAge;
  varying float vAlpha;
  varying float vConeCos;
  varying float vThick;
  varying float vMode;
  varying vec3  vLocalDir;

  // RingGeometry's inner radius, mirrored here. THREE.RingGeometry does NOT emit radial UVs — it
  // emits a planar (x,y)->[0,1]^2 projection — so reading uv.x as "across the annulus" turns the
  // SDF wall into a left-to-right gradient and the ring fills in as a soft disc. The radial
  // coordinate has to be derived from the vertex position.
  const float RING_INNER = 0.30;

  void main() {
    float life = max(aTime.y, 1e-4);
    float t = uTime - aTime.x;
    float age = t / life;
    vAge = age;
    if (age < 0.0 || age > 1.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAlpha = 0.0; return; }
    vAlpha = 1.0;
    vConeCos = aParams.x; vThick = aParams.z; vMode = aParams.w;

    vec3 axis = normalize(aAxis + vec3(1e-5));
    vec3 up = abs(axis.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(up, axis));
    vec3 bitan = cross(axis, right);

    // Radius eases out hard: a pressure front decelerates, it does not expand linearly.
    float ease = 1.0 - pow(1.0 - age, 2.6);
    float radius = mix(aSize.x, aSize.y, ease) * uSizeScale;

    // The ring geometry is authored in XY with |position| in [inner, 1].
    vec2 rc = position.xy;
    float rr = length(rc);
    vec2 dirXY = rr > 1e-5 ? rc / rr : vec2(1.0, 0.0);
    vLocalDir = vec3(dirXY, 0.0);
    vAcross = clamp((rr - RING_INNER) / (1.0 - RING_INNER), 0.0, 1.0);

    // MODE 1 = dome: lift the rim along the axis so the front reads as a convex pressure shell
    // rather than a flat plate. This is the Repulsor's authored form (bible §6: convex dome,
    // empty centre, outward ribs).
    float dome = vMode > 0.5 ? (1.0 - rr * rr) * radius * 0.55 * ease : 0.0;

    vec3 wp = aOrigin
            + (right * rc.x + bitan * rc.y) * radius
            + axis * dome
            + aVel * t + 0.5 * aAccel * t * t;

    vColor = mix(aColorA, aColorB, age);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const FRONT_FRAG = /* glsl */`
  varying float vAcross;
  varying vec3  vColor;
  varying float vAge;
  varying float vAlpha;
  varying float vConeCos;
  varying float vThick;
  varying float vMode;
  varying vec3  vLocalDir;

  uniform float uIntensity;

  void main() {
    if (vAlpha <= 0.0) discard;
    float across = vAcross;
    // Wall profile: the band sits near the OUTER rim so the front reads as a leading edge with a
    // trailing wash behind it, not as a filled plate. An SDF band rather than a texture so it stays
    // crisp at any camera distance — the brief's "tiny effects at normal camera scale" is partly a
    // resolution problem, and a texture-backed ring is where it usually starts.
    // A POWER ramp concentrated at the rim, not a symmetric band: the front is a bright leading
    // edge with a decaying wash trailing inward behind it. thickness picks the exponent, so 0 is a
    // broad pressure wash and 1 is a hard blade. A symmetric band reads as a soft tube and is what
    // makes shock fronts look like translucent geometry with bloom on it.
    float k = mix(3.0, 13.0, vThick);
    float wall = pow(across, k) * (1.0 - smoothstep(0.955, 1.0, across));

    // Directional wedge: fade the front away from the force path. coneCos = -1 leaves a full disc.
    float wedge = 1.0;
    if (vConeCos > -0.999) {
      float c = vLocalDir.x; // angle around the ring vs the +right reference
      wedge = smoothstep(vConeCos - 0.35, vConeCos + 0.15, c);
    }

    float fade = pow(1.0 - vAge, 1.7) * smoothstep(0.0, 0.06, vAge);
    float a = wall * wedge * fade * uIntensity;
    if (a <= 0.003) discard;
    // Hot leading edge, coloured body. The white rim line is what makes the front read at 110 WU;
    // across peaks at the outer edge, so the whiteness belongs there, not in the middle.
    // (No backticks in this file's GLSL comments - the shaders are template literals.)
    vec3 c = mix(vColor, vec3(1.0, 0.97, 0.93), pow(across, 4.0) * 0.9);
    gl_FragColor = vec4(c * a, a);
  }
`;

/** Front shapes. PLANE is a flat compression disc (concussion, contact). DOME lifts the rim along
 *  the axis into a convex pressure shell (repulsor, per bible §6 "convex dome, empty centre"). */
export const MODE_PLANE = 0;
export const MODE_DOME = 1;

export function createFrontSubstrate(capacity = 48) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSizeScale: { value: 1 }, uIntensity: { value: 1 } },
    vertexShader: FRONT_VERT,
    fragmentShader: FRONT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.RingGeometry(0.30, 1.0, 96, 1);
  const sub = new GpuAgedSubstrate({ name: 'fronts', capacity, geometry: ring, material });
  sub.mesh.renderOrder = 11;

  // The generic substrate packs (kind, seed, spin, drag) into aParams; the front shader reads that
  // same vec4 as (coneCos, seed, thickness, mode). Rather than make every family remember the
  // aliasing, front spawns go through a named entry point. Fields are copied explicitly — an object
  // spread here would put an allocation back into the spawn path we just spent a file avoiding.
  sub.spawnFront = function spawnFront(now, o) {
    return sub.spawn(now, {
      x: o.x, y: o.y, z: o.z,
      vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      ax: o.ax || 0, ay: o.ay || 0, az: o.az || 0,
      life: o.life, size0: o.size0, size1: o.size1,
      colorA: o.colorA, colorB: o.colorB,
      axisX: o.axisX, axisY: o.axisY, axisZ: o.axisZ,
      priority: o.priority || 0,
      // aParams aliasing, in one place:
      kind: o.coneCos === undefined ? -1 : o.coneCos,  // -1 = full disc, else cos of the wedge
      seed: o.seed || 0,
      spin: o.thickness === undefined ? 0.5 : o.thickness, // 0 = soft wash, 1 = hard wall
      drag: o.mode === undefined ? MODE_PLANE : o.mode,
    });
  };
  return sub;
}
