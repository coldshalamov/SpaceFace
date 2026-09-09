// SpaceFace — raymarched volumetric engine plume.
//
// Every other plume in this repo paints noise onto camera-facing sheets. That construction has a
// hard ceiling: a handful of flat quads cannot overlap each other enough to read as a volume, 2D
// noise in (along, across) space can only produce stripes running down the sheet, and the
// silhouette is always the geometric edge of the proxy rather than the place where density runs
// out. This shader removes all three limits by integrating through an actual density field.
//
// Per pixel: intersect an oriented box around the plume, then walk the segment inside it taking
// samples of a 3D density field and accumulating emission front-to-back with absorption. What that
// buys, in the order it matters visually:
//
//   depth        every pixel integrates the whole field, so near filaments occlude far ones and
//                the cloud has real interior structure instead of layered decals.
//   braiding     the density coordinate is domain-warped by a divergence-free curl field whose
//                amplitude grows downstream, so strands roll around each other and eddies widen
//                with distance from the throat, the way a real shear layer breaks down.
//   silhouette   the outline is wherever accumulated density fades out. It is ragged and
//                many-lobed for free, and it never shows the proxy's edge.
//   strands      ridged FBM (1 - |2n-1|, squared) makes sharp crests with dark veins between,
//                and the sample coordinate is stretched along the flow so features are far longer
//                than they are wide. Isotropic noise here would read as blobs of smoke.
//
// Cost is bounded by construction rather than by cutting quality: the proxy is tight to the plume
// so few pixels are touched, samples outside the expansion cone reject before any texture fetch,
// rays terminate as soon as transmittance saturates, and the caller scales step count by how many
// pixels the plume actually covers, so a distant ship costs almost nothing.
//
// Blending is additive into the half-float scene target with `toneMapped: false`, which is the
// existing HDR energy contract — the bloom bright-pass picks the plume up with no extra plumbing.

import * as THREE from 'three';
import { PLUME_VOLUME_SIZE } from '../volume/plumeNoiseVolume.js';

export const VOLUMETRIC_PLUME_MAX_STEPS = 64;

const PLUME_VERT = /* glsl */`
  varying vec3 vObj;
  void main() {
    vObj = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLUME_FRAG = /* glsl */`
  precision highp float;
  precision highp sampler3D;

  varying vec3 vObj;

  uniform sampler3D uVol;
  uniform float uVolSize;      // texels per axis of uVol, for step-matched mip selection
  uniform vec3  uCamObj;       // camera position in the proxy's object space
  uniform float uTime;
  uniform int   uSteps;

  uniform float uLenWU;        // plume length, world units
  uniform float uWidWU;        // proxy width (= 2x max plume radius), world units
  uniform float uExitR;        // throat radius as a fraction of the proxy half-width
  uniform float uConeMax;      // tail radius as a fraction of the proxy half-width; the gap up to
                               // 1.0 is deliberate headroom so the faint outer fringe that forms
                               // the ragged silhouette is not sliced off by the proxy's own face
  uniform float uSpread;       // expansion exponent: <1 flares early, >1 stays collimated then opens
  uniform float uFadeStart;    // axial fraction where the plume starts dying

  uniform float uNoiseScale;
  uniform float uStretch;      // axial elongation of noise features (strands, not blobs)
  uniform float uWarpAmp;
  uniform float uWarpScale;
  uniform float uWarpGrowth;   // how much harder the curl bites downstream
  uniform float uFlowSpeed;
  uniform float uThreshold;    // density floor: raises contrast, opens dark veins between strands
  uniform float uSigma;        // extinction coefficient
  uniform float uRadiance;
  uniform float uVeil;         // weight of the faint low-frequency sheets between bright strands

  uniform float uCoherence;    // axial fraction over which the solid core breaks into filaments
  uniform float uCoreDensity;  // density of that unbroken core. At 1.0 it integrates to a solid
                               // white ball at the bell; the core should read as a hot spear.
  uniform float uRadialTight;
  uniform float uDrive;
  uniform float uBoost;
  uniform float uTurb;

  uniform vec3  uCoreColor;
  uniform vec3  uMidColor;
  uniform vec3  uEdgeColor;

  uniform float uShockAmp;
  uniform float uShockPitch;   // world units between the first shock nodes
  uniform float uShockDecay;

  // Radial cutoff, in units of the local cone radius. Density is gaussian in rn with uRadialTight
  // around 2, so at 1.3 the field is already down to ~3% — cutting there costs nothing visible and
  // is what lets the march be bounded by a cylinder instead of the whole proxy box.
  const float RN_CUT = 1.3;

  /**
   * Segment of the ray that can possibly contain plume, in the proxy's object space.
   *
   * A slab test against the box is the obvious thing and it is badly wrong for cost: the plume is a
   * narrow cone inside a box sized for its widest point, so most fragments the box rasterizes are
   * rays that clip a corner and contain no plume at all. Marched against the box they still pay the
   * full step count to discover that. Bounding by the cone's own cylinder instead means those rays
   * leave immediately, and the rays that do hit spend all their samples inside the plume rather
   * than on the empty margin around it.
   */
  bool plumeSpan(vec3 ro, vec3 rd, out float t0, out float t1) {
    // Axial slab: x runs 0 at the throat to 1 at the tail.
    float ta, tb;
    if (abs(rd.x) < 1e-6) {
      if (ro.x < 0.0 || ro.x > 1.0) return false;
      ta = -1e6; tb = 1e6;
    } else {
      float ia = (0.0 - ro.x) / rd.x;
      float ib = (1.0 - ro.x) / rd.x;
      ta = min(ia, ib); tb = max(ia, ib);
    }

    // Radial bound: the widest the plume ever gets, as a half-extent in object space.
    float rMax = uConeMax * RN_CUT * 0.5;
    float a = dot(rd.yz, rd.yz);
    float b = 2.0 * dot(ro.yz, rd.yz);
    float c = dot(ro.yz, ro.yz) - rMax * rMax;
    if (a < 1e-9) {
      if (c > 0.0) return false;
    } else {
      float disc = b * b - 4.0 * a * c;
      if (disc < 0.0) return false;
      float sq = sqrt(disc);
      ta = max(ta, (-b - sq) / (2.0 * a));
      tb = min(tb, (-b + sq) / (2.0 * a));
    }

    t0 = max(ta, 0.0);
    t1 = tb;
    return t1 > t0;
  }

  // Local expansion radius as a fraction of the proxy half-width. Boost collimates: a harder
  // throat pressure ratio makes the jet spear rather than bloom.
  float coneRadius(float ax) {
    float spread = uSpread * (1.0 + uBoost * 0.45);
    return mix(uExitR, uConeMax, pow(clamp(ax, 0.0, 1.0), spread));
  }

  float densityAt(vec3 p, float lod, out float axOut, out float rnOut, out float coreOut) {
    float ax = clamp(p.x, 0.0, 1.0);
    float r = length(p.yz) * 2.0;
    float cone = coneRadius(ax);
    float rn = r / max(cone, 1e-3);
    axOut = ax;
    rnOut = rn;
    coreOut = 0.0;
    // Cheap rejection before any texture fetch. The cylinder bound is uniform along the axis, so
    // near the throat — where the cone is at its narrowest — most samples still land outside it.
    if (rn > RN_CUT) return 0.0;

    // Isotropic world-unit coordinate so noise feature size does not change when the plume
    // lengthens under boost, then stretched along the flow so features become strands.
    vec3 q = vec3(p.x * uLenWU / max(uStretch, 0.01), p.y * uWidWU, p.z * uWidWU) * uNoiseScale;
    q.x -= uTime * uFlowSpeed;

    // Curl warp. Amplitude grows with the square of axial distance: the shear layer is thin and
    // orderly at the lip and fully turbulent by the tail, so eddies visibly widen downstream.
    // The warp is sampled at uWarpScale of the density frequency, so it needs correspondingly less
    // filtering — subtracting the log of that ratio keeps it sharp while the density is softened.
    vec3 warp = textureLod(uVol, q * uWarpScale, max(0.0, lod + log2(uWarpScale))).xyz * 2.0 - 1.0;
    float grow = 0.05 + ax * ax * uWarpGrowth;
    q += warp * (uWarpAmp * grow * (1.0 + uTurb * 0.6));

    // One fetch. The ridge fold and its octaves are baked into the alpha channel, because the march
    // is fetch-bound and doing them here cost three fetches per sample for the same field.
    float fil = textureLod(uVol, q, lod).a;
    fil = max(0.0, fil - uThreshold) / max(1e-3, 1.0 - uThreshold);

    // Faint large-scale sheets between the bright strands, straight off the warp field's own
    // low frequency. The reference plume has these veils; pure ridged noise alone looks stringy.
    float veil = clamp(warp.y * 0.5 + 0.5, 0.0, 1.0) * uVeil;

    float radial = exp(-rn * rn * uRadialTight);
    float axial = smoothstep(0.0, 0.025, ax) * (1.0 - smoothstep(uFadeStart, 1.0, ax));

    // The first stretch out of the nozzle is an unbroken supersonic core; breakdown into
    // filaments happens over uCoherence. Without this the plume is wispy right at the lip,
    // which is the single most common tell of a fake jet.
    float broken = smoothstep(0.02, max(0.06, uCoherence), ax);
    float body = mix(uCoreDensity, fil + veil, broken);

    // Shock train: compression nodes on the axis, spacing tightening as the jet loses energy.
    float node = 0.0;
    if (uShockAmp > 0.001) {
      float axWU = ax * uLenWU;
      float phase = axWU / max(0.35, uShockPitch * exp(-axWU / max(1.0, uShockDecay)));
      node = pow(max(0.0, sin(phase * 6.2831853) * 0.5 + 0.5), 6.0)
        * exp(-rn * rn * 5.0) * exp(-axWU / max(1.0, uShockDecay)) * uShockAmp;
    }

    coreOut = radial * (1.0 - broken) + node;
    return max(0.0, body * radial * axial + node * axial);
  }

  vec3 emissionAt(float ax, float rn, float dens, float core) {
    // Temperature falls with distance from the throat and from the axis. Colour is driven by that,
    // not by density alone, so a dense wisp far downstream stays blue instead of going white.
    float heat = (1.0 - smoothstep(0.0, 0.30, ax)) * (1.0 - smoothstep(0.15, 1.05, rn));
    heat = clamp(heat + core * 0.5 + uBoost * 0.12, 0.0, 1.0);
    // Most of the plume sits at low density, so the mid tone has to arrive early or the whole
    // cloud reads as one flat deep blue instead of the cyan body the eye expects from hot plasma.
    vec3 c = mix(uEdgeColor, uMidColor, smoothstep(0.03, 0.40, dens));
    c = mix(c, uCoreColor, pow(heat, 1.6));
    return c;
  }

  void main() {
    vec3 ro = uCamObj;
    vec3 rd = normalize(vObj - uCamObj);
    float t0, t1;
    if (!plumeSpan(ro, rd, t0, t1)) discard;

    float span = t1 - t0;
    if (span <= 0.0) discard;

    // Sample density, not distance. The span is now the chord through the plume's own bounds, so a
    // ray clipping the fringe gets a short chord and does not need the budget a ray straight down
    // the axis does. Spending the full count on both is what made grazing fragments so expensive.
    float axialSpan = span / max(0.15, uConeMax * RN_CUT);
    int steps = int(clamp(float(uSteps) * clamp(axialSpan, 0.22, 1.0), 6.0, float(uSteps)));
    float dt = span / float(steps);

    // The proxy is non-uniformly scaled, so a fixed step in object space is a view-dependent step
    // in world space. Converting makes optical depth consistent from every angle; without it the
    // plume changes brightness as the camera orbits.
    float worldPerT = length(vec3(rd.x * uLenWU, rd.y * uWidWU, rd.z * uWidWU));
    float dtWorld = dt * worldPerT;

    // Dither the entry point so undersampling shows up as fine grain instead of concentric bands.
    float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.37);
    float t = t0 + dt * jit;

    // Mip level matching the step size. How far the noise coordinate travels per step, converted to
    // texels, is exactly the frequency above which this march cannot represent the field — so that
    // is the level to sample. Without this a coarse march does not look coarse, it looks like the
    // plume is full of crawling sparks.
    vec3 qStep = vec3(rd.x * uLenWU / max(uStretch, 0.01), rd.y * uWidWU, rd.z * uWidWU)
      * uNoiseScale * dt;
    float lod = max(0.0, log2(max(1.0, length(qStep) * uVolSize)));

    vec3 L = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < ${VOLUMETRIC_PLUME_MAX_STEPS}; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * t;
      float ax, rn, core;
      float d = densityAt(p, lod, ax, rn, core);
      if (d > 0.0025) {
        float a = 1.0 - exp(-d * uSigma * dtWorld);
        L += T * emissionAt(ax, rn, d, core) * a;
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
      t += dt;
    }

    if (T > 0.998) discard;
    gl_FragColor = vec4(L * uRadiance, 1.0);
  }
`;

/**
 * Build the raymarched plume material.
 *
 * The caller owns every visual number through uniforms so a recipe can retune the plume without
 * touching this file, and so one compiled program serves main drive and retro jets alike.
 */
export function createVolumetricPlumeMaterial(THREE_NS, opts = {}) {
  const T = THREE_NS || THREE;
  const core = opts.coreColor || [1.0, 1.0, 1.0];
  const mid = opts.midColor || [0.42, 0.86, 1.0];
  const edge = opts.edgeColor || [0.08, 0.3, 0.95];
  const mat = new T.ShaderMaterial({
    name: opts.name || 'sf-volumetric-plume',
    vertexShader: PLUME_VERT,
    fragmentShader: PLUME_FRAG,
    uniforms: {
      uVol: { value: opts.volume || null },
      uVolSize: { value: opts.volumeSize || PLUME_VOLUME_SIZE },
      uCamObj: { value: new T.Vector3(0, 0, 3) },
      uTime: { value: 0 },
      uSteps: { value: opts.steps != null ? opts.steps : 32 },

      uLenWU: { value: 18 },
      uWidWU: { value: 8 },
      uExitR: { value: 0.16 },
      uConeMax: { value: 0.66 },
      uSpread: { value: 0.62 },
      uFadeStart: { value: 0.52 },

      uNoiseScale: { value: 0.34 },
      uStretch: { value: 3.4 },
      uWarpAmp: { value: 1.15 },
      uWarpScale: { value: 0.26 },
      uWarpGrowth: { value: 1.9 },
      uFlowSpeed: { value: 9.0 },
      uThreshold: { value: 0.36 },
      uSigma: { value: 0.55 },
      uRadiance: { value: 1.0 },
      uVeil: { value: 0.28 },

      uCoherence: { value: 0.17 },
      uCoreDensity: { value: 0.62 },
      uRadialTight: { value: 2.1 },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
      uTurb: { value: 0 },

      uCoreColor: { value: new T.Vector3(core[0], core[1], core[2]) },
      uMidColor: { value: new T.Vector3(mid[0], mid[1], mid[2]) },
      uEdgeColor: { value: new T.Vector3(edge[0], edge[1], edge[2]) },

      uShockAmp: { value: 0.5 },
      uShockPitch: { value: 2.4 },
      uShockDecay: { value: 9.0 },
    },
    transparent: true,
    // BackSide keeps exactly one fragment per pixel whether or not the camera is inside the proxy,
    // which a front-face draw cannot promise once the chase camera drifts into a boosted plume.
    side: T.BackSide,
    // The proxy's own faces are meaningless as an occlusion surface: its far face sits inside the
    // hull at the throat, so depth-testing it would punch out the brightest part of the plume.
    // The plume is additive light, and light spilling across the engine housing is correct.
    depthTest: false,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
  return mat;
}

export const __testables = { PLUME_VERT, PLUME_FRAG };
