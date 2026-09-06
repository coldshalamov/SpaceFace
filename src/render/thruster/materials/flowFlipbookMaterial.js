/**
 * Flow / flipbook thruster material (per-layer).
 * Intensity applied exactly once via uIntensity (not also per-instance).
 * Billboard math entirely in world space under modelMatrix.
 * Distortion consumes signed RG (0.5-centered) + A strength from texture.
 * Axial width envelope is the shared runtime contract (axialWidthEnvelope.js).
 */

import {
  AXIAL_WIDTH_ENVELOPE_GLSL,
  resolveEnvelopeParams,
  axialWidthEnvelope,
  AXIAL_ENVELOPE_DEFAULTS,
} from '../geometry/axialWidthEnvelope.js';

export const LAYER_ROLE_PACK = Object.freeze({
  core: 0,
  inner: 1,
  sheath: 2,
  vapor: 3,
  distortion: 4,
});

export { axialWidthEnvelope, resolveEnvelopeParams, AXIAL_ENVELOPE_DEFAULTS };

/** Single-path radiance (matches fragment). Accessibility is already in intensityScale. */
export function computeLayerRadiance(baseIntensity, intensityScale, throttle, _reducedFlash) {
  const scale = Number.isFinite(intensityScale) ? intensityScale : 1;
  const t = Math.max(0, throttle || 0);
  return Math.max(0, (baseIntensity || 0) * scale * (0.55 + t * 0.9));
}

/**
 * Tumbling ships corkscrew (PQ-139.04): rad of screw per WU along the plume card
 * (~18 WU per turn). Consumed by the vertex shader's spin wobble below.
 */
export const SPIN_WOBBLE_WAVENUMBER = 0.35;

export const FLOW_FLIPBOOK_VERTEX = /* glsl */`
  attribute vec3 instanceOffset;
  attribute vec4 instanceAxisScale; // xyz axis in LOCAL parent space, w = length
  attribute vec4 instanceParams;    // x=width, y=throttleOrEnvelope, z=phase, w=boostBlend
  attribute vec4 instanceDynamics;  // x=flowSpeed, y=turbulence, z=coreSheath, w=dissipation
  attribute vec3 instanceColor;
  attribute vec2 instanceSpin;      // x=wobble amp (WU, 0 at rest), y=wobble phase (rad)

  // Tumbling ships corkscrew (PQ-139.04): rad of screw per WU along the card (~18 WU per turn).
  const float SPIN_WOBBLE_WAVENUMBER = ${SPIN_WOBBLE_WAVENUMBER.toFixed(2)};


  varying vec2 vUv;
  varying float vAlong;
  varying float vSide;
  varying float vThrottle;
  varying float vPhase;
  varying vec3 vColor;
  varying float vFlowSpeed;
  varying float vTurbulence;
  varying float vCoreSheath;
  varying float vDissipation;
  varying float vBoostBlend;

  uniform float uTime;
  uniform float uReducedMotion;
  uniform float uMinProjectedWidth;
  uniform float uLayerRole;
  uniform float uImpulseJet;
  // Shared axial envelope (must match axialWidthEnvelope.js)
  uniform float uEnvelopeThroat;
  uniform float uEnvelopePeak;
  uniform float uEnvelopeExpandU;
  uniform float uEnvelopeTaper;
  uniform float uEnvelopeMouthBreak;

${AXIAL_WIDTH_ENVELOPE_GLSL}

  void main() {
    vUv = uv;
    vAlong = uv.x;
    vSide = uv.y * 2.0 - 1.0;
    vThrottle = instanceParams.y;
    vPhase = instanceParams.z;
    vColor = instanceColor;
    // Per-instance continuum dynamics (fleet multi-entity safe).
    vFlowSpeed = instanceDynamics.x;
    vTurbulence = instanceDynamics.y;
    vCoreSheath = instanceDynamics.z;
    vDissipation = instanceDynamics.w;
    vBoostBlend = instanceParams.w;

    // --- WORLD-SPACE billboard (one space only) ---
    vec3 worldNozzle = (modelMatrix * vec4(instanceOffset, 1.0)).xyz;
    vec3 axisLocal = instanceAxisScale.xyz;
    float axisLocalLen = max(length(axisLocal), 1e-4);
    vec3 axisWorldUnnorm = mat3(modelMatrix) * axisLocal;
    float axisWorldLen = max(length(axisWorldUnnorm), 1e-4);
    vec3 axisWorld = axisWorldUnnorm / axisWorldLen;
    float lenLocal = max(instanceAxisScale.w, 1e-4);
    float lenWorld = lenLocal * (axisWorldLen / axisLocalLen);

    vec3 axisN = axisLocal / axisLocalLen;
    vec3 ePick = abs(axisN.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 e1 = normalize(cross(axisN, ePick));
    vec3 e2 = cross(axisN, e1);
    float latScale = max(0.001, 0.5 * (
      length(mat3(modelMatrix) * e1) + length(mat3(modelMatrix) * e2)
    ));
    float width = max(instanceParams.x * latScale, 1e-4);

    // Runtime axial envelope: throat / expand / taper (shared with CPU evidence)
    float envScale = axialWidthEnvelope(uv.x);
    width *= envScale;

    vec3 toCam = cameraPosition - worldNozzle;
    toCam = toCam - axisWorld * dot(toCam, axisWorld);
    float toCamLen = length(toCam);
    vec3 sideW;
    if (toCamLen > 1e-4) {
      sideW = normalize(cross(axisWorld, toCam / toCamLen));
    } else {
      vec3 e1W = mat3(modelMatrix) * e1;
      sideW = length(e1W) > 1e-4 ? normalize(e1W) : normalize(cross(axisWorld, vec3(0.0, 1.0, 0.0)));
    }
    vec3 binormalW = normalize(cross(sideW, axisWorld));
    // Keep the lift basis camera-facing even in the near-axis fallback branch. This does not
    // bypass depth testing: it only prevents an oblique jet card from being pushed into its hull.
    if (dot(binormalW, cameraPosition - worldNozzle) < 0.0) binormalW = -binormalW;
    float lift = sin(uv.x * 3.14159) * width * 0.06 * (1.0 - uReducedMotion * 0.7);
    float coreRoleV = 1.0 - step(0.5, uLayerRole);
    float rootEscape = smoothstep(0.035, 0.2, uv.x) * (1.0 - smoothstep(0.72, 0.98, uv.x));
    float cameraEscape = width * rootEscape * (coreRoleV * 0.035 + uImpulseJet * 0.13);

    vec3 viewDir = normalize(cameraPosition - worldNozzle);
    float foreshorten = 1.0 - abs(dot(viewDir, axisWorld));
    float widthEff = max(width, uMinProjectedWidth * latScale * envScale * (0.35 + 0.65 * foreshorten));

    float along = uv.x * lenWorld;
    float lateral = (uv.y - 0.5) * 2.0 * widthEff;
    vec3 world = worldNozzle - axisWorld * along + sideW * lateral
      + binormalW * (lift + cameraEscape);
    // Tumbling ships corkscrew (PQ-139.04): the card bows sideways along its length by a
    // spin-phased screw whose period is the hull's own spin (phase advances by angVel*dt on
    // the CPU). amp 0 at rest contributes an exact zero displacement — bit-identical.
    world += sideW * (instanceSpin.x * sin(instanceSpin.y - along * SPIN_WOBBLE_WAVENUMBER));
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const FLOW_FLIPBOOK_FRAGMENT = /* glsl */`
  precision highp float;

  varying vec2 vUv;
  varying float vAlong;
  varying float vSide;
  varying float vThrottle;
  varying float vPhase;
  varying vec3 vColor;
  varying float vFlowSpeed;
  varying float vTurbulence;
  varying float vCoreSheath;
  varying float vDissipation;
  varying float vBoostBlend;

  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uNoiseScale;
  uniform float uSoftEdge;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform float uTurbulence;
  uniform float uCoreSheath;
  uniform float uDissipation;
  uniform float uBoostBlend;
  uniform float uSwirl;
  uniform float uFork;
  uniform float uFlipbookCols;
  uniform float uFlipbookRows;
  uniform float uFlipbookFps;
  uniform float uUseFlipbook;
  uniform float uReducedMotion;
  uniform float uReducedFlash;
  uniform float uCoreWhitenessCap;
  uniform float uLayerRole;
  uniform float uImpulseJet;
  uniform sampler2D uMap;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Quintic fade (C2-continuous) instead of the cubic smoothstep. Continuous second
    // derivatives remove the faint lattice creasing that made advected noise read as a
    // shimmering grid rather than a body of moving liquid.
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  /** UV for one explicit flipbook cell -- lets the caller blend adjacent frames. */
  vec2 flipbookCellUv(vec2 uv, float frame) {
    float col = mod(frame, uFlipbookCols);
    float row = floor(frame / uFlipbookCols);
    vec2 cell = vec2(1.0 / uFlipbookCols, 1.0 / uFlipbookRows);
    return vec2(uv.x * cell.x + col * cell.x, uv.y * cell.y + (uFlipbookRows - 1.0 - row) * cell.y);
  }

  vec2 flipbookUv(vec2 uv, float time) {
    float frames = max(1.0, uFlipbookCols * uFlipbookRows);
    float frame = floor(mod(time * uFlipbookFps + vPhase * frames, frames));
    return flipbookCellUv(uv, frame);
  }

  void main() {
    // Per-instance continuum dynamics (fleet multi-entity). CPU always writes instanceDynamics;
    // uniforms remain family identity / precompile defaults only.
    float dynFlow = vFlowSpeed;
    float dynTurb = vTurbulence;
    float dynCore = vCoreSheath;
    float dynDiss = vDissipation;
    float dynBoost = vBoostBlend;
    // Continuous-plume flow speed is already accessibility-scaled on the CPU. Do not square
    // reduced-motion here into a frozen card.
    float flowTime = uTime * dynFlow;
    float soft = max(uSoftEdge, 0.04);
    float edgeX = smoothstep(0.0, soft, vUv.x) * (1.0 - smoothstep(1.0 - soft * 1.15, 1.0, vUv.x));
    float edgeY = 1.0 - smoothstep(1.0 - soft, 1.0, abs(vSide));
    float softMask = edgeX * edgeY;
    softMask *= softMask;

    // Roles differ in form, not tint: core stays compact, while sheath/vapor retain a broad,
    // irregular cross-section and own the dissipating tail. This prevents additive layers from
    // collapsing into one white laser needle at the gameplay camera.
    float roleSpread = clamp(uLayerRole / 3.0, 0.0, 1.0);
    float coreRole = 1.0 - step(0.5, uLayerRole);
    float innerRole = 1.0 - smoothstep(0.25, 0.75, abs(uLayerRole - 1.0));
    float sheathRole = 1.0 - smoothstep(0.25, 0.75, abs(uLayerRole - 2.0));
    float vaporRole = 1.0 - smoothstep(0.25, 0.75, abs(uLayerRole - 3.0));

    // -- Liquid advection ---------------------------------------------------------------------
    // A large-scale, slow domain warp displaces the sampling domain before any detail is read.
    // It is deliberately low-frequency and axially biased, so features stretch downstream and
    // meander as a body instead of twinkling in place. Domain warping -- not more noise octaves --
    // is what separates a flowing fluid from a scrolling noise card. The core warps least so the
    // brightest, most gameplay-legible part of the exhaust stays coherent and readable.
    vec2 warpP = vec2(vAlong * 1.75 - flowTime * 0.30, vSide * 1.05 + vPhase * 4.1);
    float warpA = valueNoise(warpP) - 0.5;
    float warpB = valueNoise(warpP * 1.93 + vec2(3.7, -2.4)) - 0.5;
    float warpGain = mix(0.30, 1.0, roleSpread) * mix(1.0, 0.42, uReducedMotion)
      * (0.6 + clamp(dynTurb, 0.0, 1.6) * 0.45);
    vec2 warp = vec2(warpA * 0.34 + warpB * 0.14, warpB * 0.26 + warpA * 0.10) * warpGain;

    float swirl = uSwirl * (0.35 + vThrottle * 0.9);
    vec2 flowUv = vec2(
      fract(vUv.x * (1.2 + uNoiseScale * 0.35) - flowTime * (0.55 + vThrottle * 0.7) + vPhase
        + warp.x * 0.22),
      vUv.y + sin(vUv.x * 5.5 + flowTime * 1.15) * swirl * 0.05 + warp.y * 0.10
    );
    // Anisotropic sampling: the field is stretched along the flow axis and compressed across it,
    // so turbulence resolves into elongated liquid striations rather than isotropic granular
    // speckle. The lowered frequencies are the coherence lever -- the previous rates dissolved
    // into uniform haze at the gameplay camera instead of reading as moving structure.
    float n1 = valueNoise(flowUv * vec2(1.45 + uNoiseScale * 0.55, 3.1 + uNoiseScale * 1.35) * uNoiseScale
      + vec2(0.0, flowTime * 0.28));
    float n2 = valueNoise(flowUv * vec2(2.2, 4.6) + vec2(flowTime * -0.28, vPhase));
    // One axial field drives attached width changes and torn edges. It is continuous in time and
    // throttle, and its non-zero floor prevents the segmented bead/disc vocabulary from returning.
    float nAxial = valueNoise(vec2(
      vAlong * (2.9 + uNoiseScale * 0.85 + dynBoost * 2.4)
        - flowTime * (0.24 + vThrottle * 0.36 + dynBoost * 0.18)
        + warp.x * 0.55,
      vPhase * 13.1 + 2.7
    ));

    // Slower axial falloff carries luminous material further downstream, so the exhaust reads as
    // a long drawn-out stream rather than a bright root with haze behind it.
    float axialPower = mix(0.42, 0.72, roleSpread);
    float axial = pow(1.0 - clamp(vAlong, 0.0, 1.0), axialPower);
    // Functional zoning: a compact pressure core at the nozzle, a directional inner stream,
    // a turbulent middle sheath, then a localized dissipating vapor tail. The layers overlap
    // enough to read as one exhaust while retaining distinct shapes at the gameplay camera.
    float mainCoreWindow = 1.0 - smoothstep(0.62, 1.0, vAlong);
    float mainInnerWindow = 1.0 - smoothstep(0.82, 1.0, vAlong);
    float mainSheathWindow = smoothstep(0.015, 0.12, vAlong) * (1.0 - smoothstep(0.82, 1.0, vAlong));
    float mainVaporWindow = smoothstep(0.08, 0.28, vAlong) * (1.0 - smoothstep(0.78, 1.0, vAlong));
    // RCS has a compact hot root and a longer, dim asymmetric exhaust release. Its zones are not
    // the main-engine windows scaled down, which keeps the one-shot impulse readable as a control jet.
    float impulseCoreWindow = 1.0 - smoothstep(0.24, 0.56, vAlong);
    float impulseInnerWindow = 1.0 - smoothstep(0.48, 0.76, vAlong);
    float impulseSheathWindow = smoothstep(0.035, 0.14, vAlong) * (1.0 - smoothstep(0.62, 0.92, vAlong));
    float impulseVaporWindow = smoothstep(0.16, 0.38, vAlong) * (1.0 - smoothstep(0.72, 1.0, vAlong));
    float coreWindow = mix(mainCoreWindow, impulseCoreWindow, uImpulseJet);
    float innerWindow = mix(mainInnerWindow, impulseInnerWindow, uImpulseJet);
    float sheathWindow = mix(mainSheathWindow, impulseSheathWindow, uImpulseJet);
    float vaporWindow = mix(mainVaporWindow, impulseVaporWindow, uImpulseJet);
    float roleWindow = coreRole * coreWindow + innerRole * innerWindow
      + sheathRole * sheathWindow + vaporRole * vaporWindow;
    roleWindow += (1.0 - clamp(coreRole + innerRole + sheathRole + vaporRole, 0.0, 1.0));
    axial *= roleWindow;
    float breakupDrive = clamp(0.24 + vThrottle * 0.66 + dynBoost * 0.34, 0.0, 1.0);
    float breakupMotion = mix(1.0, 0.38, uReducedMotion);
    float broadRole = clamp(sheathRole + vaporRole, 0.0, 1.0);
    float localWidth = 1.0 + broadRole * breakupDrive * breakupMotion * ((nAxial - 0.5) * 0.72);
    float downstream = smoothstep(0.14, 0.88, vAlong);
    float centerDrift = broadRole * (n2 - 0.5) * (0.13 + 0.12 * breakupDrive);
    centerDrift += uImpulseJet * downstream * (nAxial - 0.5) * 0.42;
    float shapedSide = (vSide - centerDrift) / max(localWidth, 0.62);
    // Core keeps its tight, bright cross-section; broad roles get a creamier falloff so the
    // layers blend into one continuous body instead of stacking as separate visible shells.
    float sideSharpness = mix(5.8 + dynCore * 0.8, 1.15 + dynCore * 0.3, roleSpread);
    sideSharpness = mix(sideSharpness, sideSharpness * 1.32, uImpulseJet * coreRole);
    float sideFall = exp(-shapedSide * shapedSide * sideSharpness);
    // The outer plasma sheath wraps the inner stream instead of filling the same centerline.
    // That makes core / flow / containment / dissipation readable as material zones rather than
    // four same-shaped cards with different colors.
    float sideAbs = abs(shapedSide);
    float sheathRim = exp(-pow((sideAbs - 0.44) * 2.75, 2.0)) * 0.64 + sideFall * 0.42;
    float vaporWisp = sideFall * (0.78 + 0.22 * sin(vAlong * 7.5 + shapedSide * 2.4 + nAxial * 3.0));
    float sheathWrap = mix(sideFall, sheathRim, mix(0.22, 0.46, breakupDrive));
    float crossShape = mix(sideFall, sheathWrap, sheathRole * mix(0.72, 0.38, uImpulseJet));
    crossShape = mix(crossShape, vaporWisp, vaporRole * mix(0.38, 0.68, uImpulseJet));
    float stream = axial * crossShape;

    // Deep, attached axial breakup: broad sheath lobes change with throttle, but a 0.38 floor
    // keeps every lobe connected to the nozzle and rules out balls, gaps, and flipbook cards.
    float attachedBreakup = 0.38 + 0.62 * smoothstep(0.12, 0.88, nAxial * 0.72 + n2 * 0.28);
    float breakupAmount = sheathRole * mix(0.42, 0.94, breakupDrive)
      + vaporRole * mix(0.32, 0.76, breakupDrive);
    breakupAmount *= breakupMotion;
    stream *= mix(1.0, attachedBreakup, clamp(breakupAmount, 0.0, 1.0));

    // Elongated shear filaments give the sheath/vapor internal flow direction. Their floor remains
    // attached and continuous, so this cannot become a row of cards, beads, or detached sprites.
    // Turbo increases filament count and axial shear; reduced motion retains the structure but
    // calms its travel. This is the structural cruise/turbo distinction, independent of opacity.
    // Fewer, broader filaments travelling further per cycle. The structure and its throttle/turbo
    // response are unchanged; only the spatial rate drops, which is what turns a fine granular
    // shimmer into visible sheets of moving liquid at the real chase-camera distance.
    float filamentPhase = shapedSide * (5.0 + breakupDrive * 2.2 + dynBoost * 1.6)
      + nAxial * 1.6 - flowTime * (0.42 + dynBoost * 0.34);
    float crossFilaments = 0.56 + 0.44 * (0.5 + 0.5 * sin(filamentPhase));
    float axialShear = 0.68 + 0.32 * smoothstep(0.18, 0.84, valueNoise(vec2(
      vAlong * (5.2 + breakupDrive * 2.8) - flowTime * (0.5 + dynBoost * 0.45),
      shapedSide * 1.7 + vPhase * 7.0
    )));
    float filamentDepth = broadRole * mix(0.30, 0.56, breakupDrive) * mix(1.0, 0.62, uReducedMotion);
    stream *= mix(1.0, crossFilaments * axialShear, filamentDepth);

    // Three unequal, nozzle-connected axial tongues replace the circular distal puff. Their
    // staggered falloffs create 2-4 readable shear notches after minification while the rootBridge
    // keeps the exhaust one attached silhouette. A nonzero analytic floor prevents bead gaps.
    float tongueCenter = exp(-pow(shapedSide * 2.05, 2.0))
      * (1.0 - smoothstep(0.74 + dynBoost * 0.08, 0.98, vAlong));
    float tongueUpper = exp(-pow((shapedSide - 0.46) * 4.2, 2.0))
      * (1.0 - smoothstep(0.52 + breakupDrive * 0.08, 0.78 + dynBoost * 0.08, vAlong));
    float tongueLower = exp(-pow((shapedSide + 0.42) * 3.8, 2.0))
      * (1.0 - smoothstep(0.6 + breakupDrive * 0.06, 0.86 + dynBoost * 0.1, vAlong));
    float tongueMask = max(tongueCenter, max(tongueUpper * 0.9, tongueLower * 0.84));
    float rootBridge = (1.0 - smoothstep(0.12, 0.38, vAlong)) * sideFall;
    float attachedTongues = max(tongueMask, rootBridge);
    float distalZone = broadRole * smoothstep(0.22, 0.58, vAlong)
      * mix(0.58, 0.82, breakupDrive) * mix(1.0, 0.74, uReducedMotion);
    stream *= mix(1.0, 0.18 + 0.82 * attachedTongues, distalZone);

    float turb = mix(0.62, 1.0, n1 * 0.65 + n2 * 0.35);
    turb = mix(1.0, turb, clamp(dynTurb, 0.0, 1.6));
    // Broad layers get coherent scalloping instead of inheriting the inner texture's narrow wisp.
    float scallop = 0.90 + 0.10 * sin(vAlong * 10.5 + n1 * 3.2 + vSide * 2.2);
    turb *= mix(1.0, scallop, clamp(sheathRole * 0.75 + vaporRole, 0.0, 1.0));
    // Coherent pressure cells modulate a continuous inner filament. The high floor prevents the
    // detached-ball/bead read while adding an engine-specific rhythm that survives minification.
    float pressureCells = 0.88 + 0.12 * sin(vAlong * 8.5 - flowTime * 1.05 + n1 * 1.2);
    pressureCells = mix(pressureCells, 0.91, uReducedMotion);
    stream *= mix(1.0, pressureCells, innerRole * 0.72);

    float tip = smoothstep(0.62, 1.0, vAlong);
    stream *= 1.0 - tip * uFork * (0.30 + n2 * 0.55);

    // A later, gentler dissipation ramp keeps the tail alive further downstream so the exhaust
    // trails off as flowing material rather than being cut short by a falloff wall.
    float dissipate = 1.0 - smoothstep(0.52, 1.06, vAlong / max(0.25, dynDiss));
    stream *= mix(0.62, 1.0, dissipate);

    // Advanced texture advection. Both paths take two taps and cross-fade, which removes the two
    // discontinuities that previously broke the illusion of continuous flow:
    //  * Scrolled masks are sampled at u and u+0.5 and blended by |2u-1|. The source masks fade to
    //    zero at u=0 and u=1, so the old single fract() tap swept a dark seam through the plume
    //    once per cycle. The tap nearest a seam always carries zero weight, so the seam is gone and
    //    the pattern stops visibly repeating.
    //  * The flipbook blends adjacent cells instead of hard-cutting, removing the 18 fps cell
    //    stutter that read as chatter rather than moving liquid.
    vec4 tex;
    if (uUseFlipbook > 0.5) {
      float frames = max(1.0, uFlipbookCols * uFlipbookRows);
      float fbPos = mix(uTime, uTime * 0.15, uReducedMotion) * uFlipbookFps + vPhase * frames;
      float fbCell = floor(fbPos);
      float fbMix = smoothstep(0.0, 1.0, fract(fbPos));
      tex = mix(
        texture2D(uMap, flipbookCellUv(vUv, mod(fbCell, frames))),
        texture2D(uMap, flipbookCellUv(vUv, mod(fbCell + 1.0, frames))),
        fbMix
      );
    } else {
      tex = mix(
        texture2D(uMap, flowUv),
        texture2D(uMap, vec2(fract(flowUv.x + 0.5), flowUv.y)),
        abs(flowUv.x * 2.0 - 1.0)
      );
    }
    float texBody = max(tex.a, max(tex.r, max(tex.g, tex.b)));
    // Textures add internal motion; they do not define the full silhouette. This static analytic
    // floor keeps reduced-motion and minified gameplay views readable without card rectangles.
    float textureWeight = mix(0.62, 0.28, roleSpread);
    float body = mix(stream, stream * texBody, textureWeight);
    float staticFloor = stream * mix(0.22, 0.34, roleSpread);
    staticFloor *= mix(1.0, 1.32, uReducedMotion);
    body = max(body, staticFloor);

    // RCS owns a compact luminous root before its directional release. This boosts only the
    // nozzle-attached core/inner material zones, never the whole impulse card.
    float impulseRoot = uImpulseJet * (1.0 - smoothstep(0.08, 0.32, vAlong));
    body *= 1.0 + impulseRoot * (coreRole * 0.52 + innerRole * 0.22);

    float coreW = coreRole;
    float heat = clamp((1.0 - vAlong * 0.7) * (0.5 + vThrottle * 0.7) + coreW * 0.35, 0.0, 1.4);
    vec3 hot = vec3(1.0, 0.985, 0.955);
    float whitenCap = mix(0.52, uCoreWhitenessCap, uReducedFlash);
    // Explicit temperature/value zones survive a bright planet as well as black space. The alpha
    // vapor is deliberately cool and low-value; it is structural dissipation, not another glow.
    vec3 coreTemp = mix(hot, vec3(0.67, 0.87, 1.0), smoothstep(0.08, 0.72, vAlong));
    vec3 innerTemp = mix(vec3(0.30, 0.82, 1.0), vec3(0.08, 0.30, 0.86), smoothstep(0.18, 0.92, vAlong));
    vec3 sheathTemp = mix(vColor, vec3(0.055, 0.09, 0.34), smoothstep(0.22, 0.96, vAlong));
    vec3 vaporTemp = mix(vColor * 0.72, vec3(0.035, 0.07, 0.14), smoothstep(0.12, 0.94, vAlong));
    vec3 col = coreRole * mix(coreTemp, hot, clamp(heat * 0.24, 0.0, whitenCap))
      + innerRole * innerTemp + sheathRole * sheathTemp + vaporRole * vaporTemp;
    col += (1.0 - clamp(coreRole + innerRole + sheathRole + vaporRole, 0.0, 1.0)) * vColor;

    // Intensity applied exactly once: uIntensity already includes base * accessibility scale.
    // Reduced-flash still restrains the hot-core whiteness above; continuous engine feedback
    // must not be dimmed a second time until it becomes invisible.
    float intensity = uIntensity * (0.55 + vThrottle * 0.9);
    float alpha = body * turb * softMask * uOpacity * (0.35 + min(intensity, 12.0) * 0.08);

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * intensity * body * turb, clamp(alpha, 0.0, 1.0));
  }
`;

/**
 * Distortion: sample signed RG (0.5 = neutral) + A strength from uMap.
 * Disabled when uDistortEnabled < 0.5 → discard (draws nothing).
 */
export const DISTORTION_FRAGMENT = /* glsl */`
  precision highp float;

  varying vec2 vUv;
  varying float vAlong;
  varying float vSide;
  varying float vThrottle;
  varying float vPhase;

  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uNoiseScale;
  uniform float uSoftEdge;
  uniform float uOpacity;
  uniform float uTurbulence;
  uniform float uDissipation;
  uniform float uReducedMotion;
  uniform float uDistortStrength;
  uniform float uDistortEnabled;
  uniform sampler2D uMap;

  void main() {
    if (uDistortEnabled < 0.5) discard;

    float soft = max(uSoftEdge, 0.08);
    float edgeX = smoothstep(0.0, soft, vUv.x) * (1.0 - smoothstep(1.0 - soft * 1.1, 1.0, vUv.x));
    float edgeY = 1.0 - smoothstep(1.0 - soft, 1.0, abs(vSide));
    float softMask = edgeX * edgeY;
    softMask *= softMask;

    float flowTime = uTime * mix(uFlowSpeed, uFlowSpeed * 0.1, uReducedMotion);
    vec2 flowUv = vec2(
      fract(vUv.x * (1.2 + uNoiseScale * 0.25) - flowTime * 0.35 + vPhase),
      vUv.y
    );
    vec4 tex = texture2D(uMap, flowUv);
    // Signed offsets from RG centered at 0.5; A = interface strength
    float ox = (tex.r - 0.5) * 2.0;
    float oy = (tex.g - 0.5) * 2.0;
    float field = tex.a;

    float axial = pow(1.0 - clamp(vAlong, 0.0, 1.0), 0.4);
    float sheath = exp(-vSide * vSide * 2.2) * axial;
    float interfaceMask = field * sheath * softMask * (0.5 + uTurbulence * 0.35);
    interfaceMask *= (1.0 - smoothstep(0.55, 1.0, vAlong / max(0.3, uDissipation)));

    float strength = clamp(interfaceMask * uOpacity * uDistortStrength, 0.0, 1.0);
    if (strength < 0.004) discard;

    // Pass through signed RG for consumer (re-encode mid-gray) * strength
    float outX = ox * uDistortStrength * strength;
    float outY = oy * uDistortStrength * strength;
    gl_FragColor = vec4(outX * 0.5 + 0.5, outY * 0.5 + 0.5, 0.5, strength);
  }
`;

export const DISTORTION_INTERFACE_CONTRACT = Object.freeze({
  schema: 'spaceface.thrusterDistortionInterface.v1',
  textureEncoding: {
    r: 'signed offset X, 0.5 = neutral, 0 = -1, 1 = +1',
    g: 'signed offset Y, 0.5 = neutral',
    b: 'reserved 0.5',
    a: 'interface strength 0..1',
  },
  outputChannels: {
    r: 'screenOffsetX encoded mid-gray',
    g: 'screenOffsetY encoded mid-gray',
    b: 'reserved 0.5',
    a: 'interface strength 0..1',
  },
  requiresConsumer: true,
  noInterfacePath: 'uDistortEnabled=0 discards all fragments (draws nothing)',
  notEmissive: true,
});

export function createFlowFlipbookMaterial(THREE, options = {}) {
  if (!THREE) throw new TypeError('createFlowFlipbookMaterial requires THREE');

  const isDistort = options.role === 'distortion' || options.distortion === true;
  const blendMode = options.blending === 'alpha' || options.blend === 'alpha'
    ? THREE.NormalBlending
    : options.blend === 'multiply'
      ? THREE.MultiplyBlending
      : THREE.AdditiveBlending;

  const uniforms = {
    uTime: { value: 0 },
    uFlowSpeed: { value: num(options.flowSpeed, 2.4) },
    uNoiseScale: { value: num(options.noiseScale, 1.5) },
    uSoftEdge: { value: num(options.softEdge, 0.28) },
    uIntensity: { value: num(options.intensity, 5.5) },
    uOpacity: { value: num(options.opacity, 0.6) },
    uTurbulence: { value: num(options.turbulence, 0.7) },
    uCoreSheath: { value: num(options.coreSheath, 0.8) },
    uDissipation: { value: num(options.dissipation, 1.0) },
    uBoostBlend: { value: num(options.boostBlend, 0) },
    uSwirl: { value: num(options.swirl, 0.45) },
    uFork: { value: num(options.fork, 0.4) },
    uFlipbookCols: { value: num(options.flipbookCols, 4) },
    uFlipbookRows: { value: num(options.flipbookRows, 4) },
    uFlipbookFps: { value: num(options.flipbookFps, 16) },
    uUseFlipbook: { value: options.useFlipbook ? 1 : 0 },
    uReducedMotion: { value: options.reducedMotion ? 1 : 0 },
    uReducedFlash: { value: options.reducedFlash ? 1 : 0 },
    uCoreWhitenessCap: { value: num(options.coreWhitenessCap, 0.35) },
    uLayerRole: { value: num(options.layerRole, LAYER_ROLE_PACK[options.role] ?? 0) },
    uImpulseJet: { value: options.impulseJet ? 1 : 0 },
    uMap: { value: options.map || null },
    uMinProjectedWidth: { value: num(options.minProjectedWidth, 0.04) },
    uDistortStrength: { value: num(options.distortStrength, 0.35) },
    uDistortEnabled: { value: isDistort && options.distortEnabled !== false ? 1 : 0 },
    // Shared axial envelope (defaults match axialWidthEnvelope.js)
    uEnvelopeThroat: { value: num(options.envelopeThroat, AXIAL_ENVELOPE_DEFAULTS.throat) },
    uEnvelopePeak: { value: num(options.envelopePeak, AXIAL_ENVELOPE_DEFAULTS.peak) },
    uEnvelopeExpandU: { value: num(options.envelopeExpandU, AXIAL_ENVELOPE_DEFAULTS.expandU) },
    uEnvelopeTaper: { value: num(options.envelopeTaper, AXIAL_ENVELOPE_DEFAULTS.taper) },
    uEnvelopeMouthBreak: { value: num(options.envelopeMouthBreak, AXIAL_ENVELOPE_DEFAULTS.mouthBreak) },
  };

  const material = new THREE.ShaderMaterial({
    name: options.name || (isDistort ? 'ThrusterDistortionInterfaceMaterial' : 'ThrusterFlowFlipbookMaterial'),
    uniforms,
    vertexShader: FLOW_FLIPBOOK_VERTEX,
    fragmentShader: isDistort ? DISTORTION_FRAGMENT : FLOW_FLIPBOOK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest !== false,
    blending: isDistort ? THREE.NormalBlending : blendMode,
    side: THREE.DoubleSide,
    toneMapped: false,
    forceSinglePass: true,
  });

  if (material && typeof material.then === 'function') {
    throw new TypeError('createFlowFlipbookMaterial returned a thenable');
  }

  material.userData.flowFlipbook = !isDistort;
  material.userData.thrusterMaterial = true;
  material.userData.distortionInterface = isDistort;
  material.userData.layerRole = options.role || 'core';
  material.userData.impulseJet = !!options.impulseJet;
  material.userData.blend = options.blend || (isDistort ? 'alpha' : 'additive');
  material.userData.textureId = options.textureId || null;
  material.userData.baseIntensity = num(options.intensity, 5.5);
  material.userData.distortionContract = isDistort ? DISTORTION_INTERFACE_CONTRACT : null;
  material.userData.axialEnvelope = {
    throat: uniforms.uEnvelopeThroat.value,
    peak: uniforms.uEnvelopePeak.value,
    expandU: uniforms.uEnvelopeExpandU.value,
    taper: uniforms.uEnvelopeTaper.value,
    mouthBreak: uniforms.uEnvelopeMouthBreak.value,
  };
  material.userData.usesSharedAxialEnvelope = true;
  return material;
}

/**
 * Bind envelope uniforms from a thruster recipe (construction-time, no per-frame alloc).
 * Returns the resolved params object for tests/evidence.
 */
export function bindEnvelopeFromRecipe(material, recipe) {
  const p = resolveEnvelopeParams(recipe || {});
  if (!material || !material.uniforms) return p;
  const u = material.uniforms;
  if (u.uEnvelopeThroat) u.uEnvelopeThroat.value = p.throat;
  if (u.uEnvelopePeak) u.uEnvelopePeak.value = p.peak;
  if (u.uEnvelopeExpandU) u.uEnvelopeExpandU.value = p.expandU;
  if (u.uEnvelopeTaper) u.uEnvelopeTaper.value = p.taper;
  if (u.uEnvelopeMouthBreak) u.uEnvelopeMouthBreak.value = p.mouthBreak;
  material.userData.axialEnvelope = p;
  material.userData.usesSharedAxialEnvelope = true;
  return p;
}

/**
 * Direct uniform mutation — no object allocation. Prefer over object-state API on hot path.
 */
export function setMaterialUniforms(material, values) {
  if (!material || !material.uniforms) return;
  const u = material.uniforms;
  if (values.time != null && u.uTime) u.uTime.value = values.time;
  if (values.flowSpeed != null && u.uFlowSpeed) u.uFlowSpeed.value = values.flowSpeed;
  if (values.noiseScale != null && u.uNoiseScale) u.uNoiseScale.value = values.noiseScale;
  if (values.softEdge != null && u.uSoftEdge) u.uSoftEdge.value = values.softEdge;
  if (values.intensity != null && u.uIntensity) u.uIntensity.value = values.intensity;
  if (values.opacity != null && u.uOpacity) u.uOpacity.value = values.opacity;
  if (values.turbulence != null && u.uTurbulence) u.uTurbulence.value = values.turbulence;
  if (values.coreSheath != null && u.uCoreSheath) u.uCoreSheath.value = values.coreSheath;
  if (values.dissipation != null && u.uDissipation) u.uDissipation.value = values.dissipation;
  if (values.boostBlend != null && u.uBoostBlend) u.uBoostBlend.value = values.boostBlend;
  if (values.swirl != null && u.uSwirl) u.uSwirl.value = values.swirl;
  if (values.fork != null && u.uFork) u.uFork.value = values.fork;
  if (values.reducedMotion != null && u.uReducedMotion) u.uReducedMotion.value = values.reducedMotion ? 1 : 0;
  if (values.reducedFlash != null && u.uReducedFlash) u.uReducedFlash.value = values.reducedFlash ? 1 : 0;
  if (values.map != null && u.uMap) u.uMap.value = values.map;
  if (values.distortEnabled != null && u.uDistortEnabled) u.uDistortEnabled.value = values.distortEnabled ? 1 : 0;
  if (values.distortStrength != null && u.uDistortStrength) u.uDistortStrength.value = values.distortStrength;
  if (values.useFlipbook != null && u.uUseFlipbook) u.uUseFlipbook.value = values.useFlipbook ? 1 : 0;
  if (values.flipbookCols != null && u.uFlipbookCols) u.uFlipbookCols.value = values.flipbookCols;
  if (values.flipbookRows != null && u.uFlipbookRows) u.uFlipbookRows.value = values.flipbookRows;
  if (values.flipbookFps != null && u.uFlipbookFps) u.uFlipbookFps.value = values.flipbookFps;
  if (values.envelopeTaper != null && u.uEnvelopeTaper) u.uEnvelopeTaper.value = values.envelopeTaper;
  if (values.envelopeMouthBreak != null && u.uEnvelopeMouthBreak) u.uEnvelopeMouthBreak.value = values.envelopeMouthBreak;
  if (values.envelopeThroat != null && u.uEnvelopeThroat) u.uEnvelopeThroat.value = values.envelopeThroat;
  if (values.envelopePeak != null && u.uEnvelopePeak) u.uEnvelopePeak.value = values.envelopePeak;
  if (values.envelopeExpandU != null && u.uEnvelopeExpandU) u.uEnvelopeExpandU.value = values.envelopeExpandU;
}

/** @deprecated use setMaterialUniforms on hot path */
export function updateFlowFlipbookMaterial(material, state = {}) {
  setMaterialUniforms(material, state);
}

function num(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
