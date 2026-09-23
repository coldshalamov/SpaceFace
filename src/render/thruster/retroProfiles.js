// A single physical vocabulary for the paired bow nozzles and their exhaust. The dimensions are
// fractions of the normalized ship hull; the render assembly scales them with entity.radius.
const PROFILES = Object.freeze({
  engine_ion_small:   Object.freeze({ station: 0.45, halfSpan: 0.40, bell: 0.115, segments: 12, length: 0.72, width: 0.78, flow: 2.7, coherence: 0.94 }),
  engine_ion_twin:    Object.freeze({ station: 0.43, halfSpan: 0.49, bell: 0.105, segments: 12, length: 0.80, width: 0.73, flow: 3.0, coherence: 0.96 }),
  engine_industrial:  Object.freeze({ station: 0.38, halfSpan: 0.46, bell: 0.145, segments: 10, length: 0.62, width: 0.93, flow: 1.8, coherence: 0.90 }),
  engine_resonator:   Object.freeze({ station: 0.48, halfSpan: 0.44, bell: 0.120, segments: 6, length: 0.77, width: 0.80, flow: 3.2, coherence: 0.97 }),
  engine_vector:      Object.freeze({ station: 0.49, halfSpan: 0.48, bell: 0.090, segments: 8, length: 0.81, width: 0.66, flow: 3.5, coherence: 0.98 }),
  engine_plasma_ring: Object.freeze({ station: 0.41, halfSpan: 0.47, bell: 0.130, segments: 14, length: 0.73, width: 0.85, flow: 2.4, coherence: 0.93 }),
});

export function retroProfileFor(engineProfileId) {
  return PROFILES[engineProfileId] || PROFILES.engine_ion_small;
}

// Keep the visible plume inside the physical bell on a starter (radius 14), and scale both on
// larger hulls. The cap only applies past the current flyable roster's largest radius.
export function retroWorldScale(radius) {
  const r = Number.isFinite(radius) && radius > 0 ? radius : 10.5;
  return Math.max(0.65, Math.min(4.5, r / 10.5));
}
