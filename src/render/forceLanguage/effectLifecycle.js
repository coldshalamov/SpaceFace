/**
 * Shared VFX envelope. Seconds, not frames; presentation only, never a force timer.
 * Every field gets ignition -> build -> sustain -> release -> dead. Charge arrives along
 * full-reach paths; an interrupted onset releases only the material already supplied.
 */
export const FIELD_LIFECYCLES = Object.freeze({
  seed: Object.freeze({ code: 1, attack: 0.50, release: 0.64, motion: 'reciprocating lock jaws' }),
  well: Object.freeze({ code: 2, attack: 0.70, release: 0.86, motion: 'turning inward folds' }),
  repulsor: Object.freeze({ code: 3, attack: 0.42, release: 0.68, motion: 'outward pressure crests' }),
  cone: Object.freeze({ code: 4, attack: 0.46, release: 0.56, motion: 'source-to-tip transport' }),
  sheet: Object.freeze({ code: 5, attack: 0.58, release: 0.72, motion: 'lateral intake strokes' }),
});
export const FIELD_RELEASE_SECONDS = Math.max(...Object.values(FIELD_LIFECYCLES).map(x => x.release));
export const FIELD_ROLE = Object.freeze({ BODY: 0, BOUNDARY: 1, CREST: 2, JAW: 3 });
export const clamp01 = v => Math.max(0, Math.min(1, v));
export const smooth01 = v => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/** CPU lifecycle diagnostics. Geometry always keeps its full path extent. Build is the
 * supply-front progress; mature interactions follow it. Opacity summarizes remaining material,
 * not a uniform GPU fade: individual paths apply their own arrival, coast and erosion. */
export function sampleFieldLifecycle(time, born, releasedAt, recipe, out) {
  const releasing = releasedAt >= 0;
  const attackTime = Math.max(0, (releasing ? Math.min(time, releasedAt) : time) - born);
  out.build = smooth01(attackTime / recipe.attack);
  out.release = releasing ? smooth01((time - releasedAt) / recipe.release) : 0;
  out.supply = releasing ? 0 : out.build;
  out.matureInteraction = smooth01((attackTime - recipe.attack * 0.90) / (recipe.attack * 0.95));
  out.scale = out.crossScale = 1;
  out.opacity = smooth01(attackTime / Math.min(0.10, recipe.attack)) * (1 - out.release);
  out.stage = releasing ? (out.release >= 1 ? 'dead' : 'release')
    : attackTime < 0.10 ? 'ignition' : attackTime < recipe.attack ? 'build' : 'sustain';
  return out;
}

/** One-shot source envelope: ignition is prompt; extrusion and cooling have separate curves. */
export function sampleDischargeLifecycle(age, life, reducedMotion, out) {
  const t = clamp01(age / Math.max(0.001, life));
  const ignite = smooth01(t / 0.16);
  const cool = smooth01((t - 0.18) / 0.82);
  out.length = reducedMotion ? 1 : 0.18 + 0.82 * ignite + 0.12 * cool;
  out.width = reducedMotion ? 1 : (0.30 + 0.70 * ignite) * (1 - 0.55 * cool);
  out.opacity = (0.25 + 0.75 * ignite) * (1 - cool);
  return out;
}

/**
 * Contact impulse envelope: the compression front is already open on the first frame (a hit
 * has no spool-up), then material cools and erodes from the contact outward. Reduced motion
 * freezes extent growth, never the fade; the fragment's fracture stage still runs.
 */
export function sampleImpactLifecycle(age, life, reducedMotion, out) {
  const t = clamp01(age / Math.max(0.001, life));
  const flash = smooth01(t / 0.12);
  const cool = smooth01((t - 0.10) / 0.90);
  out.length = reducedMotion ? 1 : 0.42 + 0.58 * flash + 0.08 * cool;
  out.width = reducedMotion ? 1 : (0.38 + 0.62 * flash) * (1 - 0.58 * cool);
  out.opacity = (0.42 + 0.58 * flash) * (1 - cool);
  return out;
}
