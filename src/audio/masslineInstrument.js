// PQ-158.02 — the Massline as an instrument.
//
// Pure presentation resolver. Tension maps to pitch, strain maps to grit, and each named event
// (attach, strain, reel, release, break, bridle) resolves to its own recipe and caption. Audio
// never writes sim state; callers pass the live tether snapshot in.
//
// Release is a taut let-go. Break is a cable failure. They must not share a recipe.

export const MASSLINE_INSTRUMENT_SEED = 15802;

export const MASSLINE_INSTRUMENT_EVENTS = Object.freeze([
  'attach', 'strain', 'reel', 'release', 'break', 'bridle',
]);

export const MASSLINE_CAPTIONS = Object.freeze({
  attach: 'Massline attached.',
  strain: 'Massline strain.',
  reel: 'Massline reel.',
  release: 'Massline release.',
  break: 'Massline break.',
  bridle: 'Twin bridle chord.',
});

export const MASSLINE_RECIPES = Object.freeze({
  attach: 'sfx.tetherLatch',
  strain: 'sfx_tether_strain_creak',
  reel: 'sfx_massline_reel_whine',
  release: 'sfx_massline_release',
  break: 'sfx.tetherSnap',
  bridle: 'sfx_massline_bridle_chord',
});

// Existing tether-hum law (audioSystem._updateTetherHum): keep the numbers, own them here so
// pitch/grit have one writer.
export const MASSLINE_HUM_BASE_HZ = 90;
export const MASSLINE_HUM_STRAIN_HZ = 220;
export const MASSLINE_PITCH_RATE_MIN = 0.82;
export const MASSLINE_PITCH_RATE_SPAN = 0.70;
export const MASSLINE_REEL_COOLDOWN_TICKS = 12;

const EXISTING_ONE_SHOT = Object.freeze({
  attach: true,
  strain: true,
  break: true,
});

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

function eventName(input) {
  const raw = input && (input.event || input.kind || input.id);
  const id = String(raw || '').toLowerCase();
  if (MASSLINE_RECIPES[id]) return id;
  if (id.includes('bridle') || id.includes('twin_bridle')) return 'bridle';
  if (id.includes('reel')) return 'reel';
  if (id.includes('release')) return 'release';
  if (id.includes('break') || id.includes('snap') || id.includes('broken')) return 'break';
  if (id.includes('strain') || id.includes('near_break') || id.includes('nearbreak')) return 'strain';
  if (id.includes('attach') || id.includes('latch')) return 'attach';
  return null;
}

function isBridleHead(input) {
  const payload = input && input.payload;
  const head = String(
    (input && (input.headId || input.attachmentDefId || input.defId))
    || (payload && (payload.headId || payload.attachmentDefId || payload.defId || payload.masslineHeadId))
    || '',
  ).toLowerCase();
  return head.includes('bridle') || head.includes('twin_bridle');
}

function classificationOf(input) {
  const payload = input && input.payload;
  return String((input && input.classification) || (payload && payload.classification) || '').toLowerCase();
}

/**
 * Tension (0..1) → playback rate. One octave-ish of climb across a loaded line.
 * Pure. Seed 15802.
 */
export function masslinePitchRate(tension) {
  return MASSLINE_PITCH_RATE_MIN + clamp(tension, 0, 1) * MASSLINE_PITCH_RATE_SPAN;
}

/**
 * Strain (0..1.25) → grit 0..1. The existing overload oscillator opens at 0.72; grit is the
 * continuous version of that edge.
 */
export function masslineGrit(strain) {
  return clamp(strain, 0, 1);
}

/** Continuous hum frequency for a live line. Same numbers the bed already used. */
export function masslineHumHz(strain) {
  return MASSLINE_HUM_BASE_HZ + clamp(strain, 0, 1.25) * MASSLINE_HUM_STRAIN_HZ;
}

function reelDelta(input) {
  const payload = input && input.payload;
  const before = Number((input && input.before) != null ? input.before : payload && payload.before);
  const after = Number((input && input.after) != null ? input.after : payload && payload.after);
  if (Number.isFinite(before) && Number.isFinite(after)) return Math.abs(after - before);
  const speed = Number((input && input.reelSpeed) != null ? input.reelSpeed : payload && payload.reelSpeed);
  return Number.isFinite(speed) ? Math.abs(speed) : 0;
}

/**
 * Resolve a Massline presentation event to recipe, pitch, grit, and a caption that names it.
 * `play` is false when an older first-hour / 158.06 one-shot already owns the voice, so this
 * module never doubles attach/strain/break. Reel, clean release, and bridle always speak.
 */
export function resolveMasslineInstrument(input = {}) {
  let event = eventName(input);
  if (!event && isBridleHead(input)) event = 'bridle';
  if (!event) return null;

  // A twin-bridle attach is still an attach for the latch, plus a bridle chord the caller can
  // request separately by event: 'bridle'.
  const tension = Number.isFinite(input.tension)
    ? input.tension
    : Number.isFinite(input.load) ? input.load : 0;
  const strain = Number.isFinite(input.strain) ? input.strain : tension;
  const klass = classificationOf(input);
  const messyRelease = event === 'release' && (!klass || klass === 'messy');

  const recipeId = MASSLINE_RECIPES[event];
  const caption = MASSLINE_CAPTIONS[event];
  const rate = event === 'strain' || event === 'reel'
    ? masslinePitchRate(event === 'reel' ? Math.min(1, reelDelta(input) * 4 + tension) : tension)
    : event === 'release' ? 1.18
      : event === 'break' ? 0.92
        : event === 'bridle' ? 1.0
          : 1.0;
  const grit = event === 'strain' || event === 'reel' ? masslineGrit(strain) : event === 'break' ? 0.85 : 0;
  const owned = !!EXISTING_ONE_SHOT[event] || messyRelease;
  const audible = true;

  return Object.freeze({
    schema: 'spaceface.masslineInstrument.v1',
    event,
    recipeId,
    caption,
    rate: Math.round(rate * 1000) / 1000,
    grit: Math.round(grit * 1000) / 1000,
    humHz: Math.round(masslineHumHz(strain) * 100) / 100,
    gain: event === 'break' ? 0.92
      : event === 'release' ? 0.78
        : event === 'reel' ? 0.42 + grit * 0.28
          : event === 'bridle' ? 0.7
            : event === 'strain' ? 0.55 + grit * 0.3
              : 0.78,
    critical: event === 'break' || event === 'strain' || event === 'bridle',
    warning: event === 'break' || event === 'strain',
    distinctFrom: event === 'release' ? 'break' : event === 'break' ? 'release' : null,
    playbackOwnedByExisting: owned,
    play: audible && !owned,
    seed: MASSLINE_INSTRUMENT_SEED,
  });
}

export function masslineInstrumentCaption(event) {
  return MASSLINE_CAPTIONS[event] || null;
}

export function masslineEventsAreDistinct() {
  const recipes = MASSLINE_INSTRUMENT_EVENTS.map((event) => MASSLINE_RECIPES[event]);
  const captions = MASSLINE_INSTRUMENT_EVENTS.map((event) => MASSLINE_CAPTIONS[event]);
  return {
    recipes: new Set(recipes).size === recipes.length,
    captions: new Set(captions).size === captions.length,
    releaseVsBreak: MASSLINE_RECIPES.release !== MASSLINE_RECIPES.break
      && MASSLINE_CAPTIONS.release !== MASSLINE_CAPTIONS.break,
  };
}
