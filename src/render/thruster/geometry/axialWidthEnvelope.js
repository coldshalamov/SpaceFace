/**
 * Shared axial width envelope — single contract for CPU evidence and runtime GLSL.
 * Compact nozzle throat → curved expansion → tapered dissipation (not a constant card).
 *
 * u in [0,1]: 0 at nozzle root, 1 at tail.
 * Returns dimensionless width scale (multiply by layer base width).
 */

export const AXIAL_ENVELOPE_DEFAULTS = Object.freeze({
  throat: 0.22,
  peak: 1.0,
  expandU: 0.28,
  taper: 0.72,
  mouthBreak: 0.35,
});

/**
 * Resolve envelope params from a thruster recipe (geometry + identity.geometryCharacter).
 * Call at construction/bind time — not per frame.
 */
export function resolveEnvelopeParams(recipe = {}) {
  const geo = recipe.geometry || {};
  const idn = recipe.identity?.geometryCharacter || {};
  return {
    throat: AXIAL_ENVELOPE_DEFAULTS.throat,
    peak: AXIAL_ENVELOPE_DEFAULTS.peak,
    expandU: AXIAL_ENVELOPE_DEFAULTS.expandU,
    taper: geo.taper ?? idn.taper ?? AXIAL_ENVELOPE_DEFAULTS.taper,
    mouthBreak: idn.mouthBreak ?? AXIAL_ENVELOPE_DEFAULTS.mouthBreak,
  };
}

/**
 * Smoothstep helper (Hermite).
 */
export function smoothstep01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Axial width envelope — exact runtime contract.
 * @param {number} u axial [0,1]
 * @param {{throat?:number,peak?:number,expandU?:number,taper?:number,mouthBreak?:number}} p
 */
export function axialWidthEnvelope(u, p = {}) {
  const throat = p.throat ?? AXIAL_ENVELOPE_DEFAULTS.throat;
  const peak = p.peak ?? AXIAL_ENVELOPE_DEFAULTS.peak;
  const expandU = p.expandU ?? AXIAL_ENVELOPE_DEFAULTS.expandU;
  const taper = p.taper ?? AXIAL_ENVELOPE_DEFAULTS.taper;
  const mouthBreak = p.mouthBreak ?? AXIAL_ENVELOPE_DEFAULTS.mouthBreak;
  const uu = Math.max(0, Math.min(1, u));
  // Rapid curved expansion from compact throat
  const expand = uu < expandU
    ? throat + (peak - throat) * smoothstep01(uu / Math.max(1e-6, expandU))
    : peak;
  // Tail taper (geometry.taper)
  const tailTaper = Math.pow(Math.max(0, 1 - uu), Math.max(0.4, taper));
  // Soft mouth break near nozzle (one-sided irregularity scale factor left to caller)
  const mouth = 1 + mouthBreak * Math.sin(Math.min(1, uu * 4) * Math.PI)
    * Math.max(0, 1 - uu * 2.2) * 0.15;
  return Math.max(0.12, expand * (0.55 + 0.45 * tailTaper) * mouth);
}

/**
 * GLSL source for the same envelope — must stay algebraically equivalent to axialWidthEnvelope.
 * Injected into flowFlipbookMaterial vertex shader.
 */
export const AXIAL_WIDTH_ENVELOPE_GLSL = /* glsl */`
// Shared axial width envelope (must match axialWidthEnvelope.js)
// uniforms: uEnvelopeThroat, uEnvelopePeak, uEnvelopeExpandU, uEnvelopeTaper, uEnvelopeMouthBreak
float axialWidthEnvelope(float u) {
  float uu = clamp(u, 0.0, 1.0);
  float t = clamp(uu / max(uEnvelopeExpandU, 1e-6), 0.0, 1.0);
  float s = t * t * (3.0 - 2.0 * t);
  float expand = uu < uEnvelopeExpandU
    ? mix(uEnvelopeThroat, uEnvelopePeak, s)
    : uEnvelopePeak;
  float tailTaper = pow(max(0.0, 1.0 - uu), max(0.4, uEnvelopeTaper));
  float mouth = 1.0 + uEnvelopeMouthBreak * sin(min(1.0, uu * 4.0) * 3.14159265)
    * max(0.0, 1.0 - uu * 2.2) * 0.15;
  return max(0.12, expand * (0.55 + 0.45 * tailTaper) * mouth);
}
`;

/**
 * Sample envelope at fixed test points for parity checks (JS vs GLSL-equivalent).
 */
export function envelopeSampleTable(p = {}) {
  const us = [0, 0.05, 0.15, 0.28, 0.4, 0.6, 0.85, 1.0];
  return us.map((u) => ({ u, w: axialWidthEnvelope(u, p) }));
}
