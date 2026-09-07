// Opt-in recipe profile for the existing audio:cue owner. No oscillator, AudioContext,
// independent voice pool or event subscription is created here. Cached recipe objects
// retain their identity; disposal restores their complete original property descriptors.
// src/audio/synth.js adds a fixed 40ms decay and 20ms post-envelope voice cleanup.
const DEFINITIONS = [
  ['open', 'sfx_ui_open', 110, 100, 500, 0.004, 0.18, 0.12, 0.48, 250],
  ['close', 'sfx_ui_back', 82, 74, 420, 0.004, 0.18, 0.12, 0.45, 250],
  ['move', 'sfx_ui_tab', 660, 640, 2400, 0.001, 0.01, 0.02, 0.24, 60],
  ['confirm', 'sfx_ui_confirm', 440, 440, 3000, 0.005, 0.22, 0.18, 0.55, 300],
  ['deny', 'sfx_ui_error', 330, 247, 900, 0.003, 0.20, 0.16, 0.50, 300],
  ['dock', 'sfx_dock_clunk', 48, 62, 600, 0.10, 0.65, 0.48, 0.60, 900],
  ['undock', 'sfx_undock_release', 62, 48, 500, 0.03, 0.45, 0.32, 0.52, 600],
  ['wanted', 'sfx_wanted_alert', 196, 196, 800, 0.25, 0.80, 0.60, 0.48, 1200],
];

export const KIT_SOUND_PALETTE = Object.freeze(DEFINITIONS.map(
  ([name, id, from, to, cutoff, attack, release, sweep, gain, maxMs]) => Object.freeze({
    name, maxMs,
    // Duration is the audible envelope, not the existing owner's silent GC tail.
    envelopeMs: Math.round((attack + 0.04 + release) * 1000),
    cleanupMs: 20,
    recipe: Object.freeze({
      id, category: 'ui', type: 'oscillator', wave: 'sine',
      baseFreq: from, freqSweep: Object.freeze([from, to]), sweepTimeS: sweep,
      gainEnvelope: Object.freeze({ attack, sustain: 0.18, release }),
      filterType: 'lowpass', filterFreq: cutoff, filterQ: 0.7,
      gainMult: gain, pitchRange: Object.freeze([1, 1]),
    }),
  }),
));
const installed = new WeakMap();

/** Lease a profile. Validate all eight existing IDs before touching any of them. */
export function installKitPalette(recipes) {
  if (!Array.isArray(recipes)) throw new TypeError('Kit palette requires the existing recipe array');
  const prior = installed.get(recipes);
  if (prior) { prior.leases += 1; return release(prior); }
  const records = KIT_SOUND_PALETTE.map(({ recipe }) => {
    const matches = recipes.filter(value => value?.id === recipe.id);
    if (matches.length !== 1) throw new Error(`Kit palette needs exactly one ${recipe.id}`);
    const target = matches[0];
    const original = Object.getOwnPropertyDescriptors(target);
    if (!Object.isExtensible(target) || Object.values(original).some(value => !value.configurable)) {
      throw new Error(`Kit palette cannot profile immutable recipe ${recipe.id}`);
    }
    return { target, original, replacement: {
      ...recipe, freqSweep: [...recipe.freqSweep], pitchRange: [...recipe.pitchRange],
      gainEnvelope: { ...recipe.gainEnvelope },
    } };
  });
  const profile = { recipes, records, leases: 1 };
  for (const { target, replacement } of records) {
    for (const key of Reflect.ownKeys(target)) delete target[key];
    Object.assign(target, replacement);
  }
  installed.set(recipes, profile);
  return release(profile);
}

function release(profile) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--profile.leases > 0) return;
    for (const { target, original } of profile.records) {
      for (const key of Reflect.ownKeys(target)) delete target[key];
      Object.defineProperties(target, original);
    }
    installed.delete(profile.recipes);
  };
}
