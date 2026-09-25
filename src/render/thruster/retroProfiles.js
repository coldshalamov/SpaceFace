// A single physical vocabulary for the paired bow retros and their exhaust. The dimensions are
// fractions of the normalized ship hull; the render assembly scales them with entity.radius.
// `station` sits on the bow shoulder — ahead of it the hull collapses to the nose spine, so a
// mount parked further forward floats in open air. `coherence` is the fraction of the jet that
// stays a collimated column before it frays into streamers — a brake jet keeps a tight throat
// and then visibly shreds, it is not a rigid tube.
const PROFILES = Object.freeze({
  engine_ion_small:   Object.freeze({ station: 0.41, halfSpan: 0.40, bell: 0.040, segments: 12, length: 0.72, width: 0.78, flow: 2.7, coherence: 0.46 }),
  engine_ion_twin:    Object.freeze({ station: 0.40, halfSpan: 0.46, bell: 0.038, segments: 12, length: 0.80, width: 0.73, flow: 3.0, coherence: 0.50 }),
  engine_industrial:  Object.freeze({ station: 0.36, halfSpan: 0.44, bell: 0.050, segments: 10, length: 0.62, width: 0.93, flow: 1.8, coherence: 0.34 }),
  engine_resonator:   Object.freeze({ station: 0.42, halfSpan: 0.44, bell: 0.042, segments: 6, length: 0.77, width: 0.80, flow: 3.2, coherence: 0.42 }),
  engine_vector:      Object.freeze({ station: 0.43, halfSpan: 0.45, bell: 0.034, segments: 8, length: 0.81, width: 0.66, flow: 3.5, coherence: 0.55 }),
  engine_plasma_ring: Object.freeze({ station: 0.39, halfSpan: 0.45, bell: 0.046, segments: 14, length: 0.73, width: 0.85, flow: 2.4, coherence: 0.38 }),
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
