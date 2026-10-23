// src/audio/recipeCaptions.js — PLACEHOLDER for Robin's uncommitted recipe-caption module.
// 6a9eec796e ("Polish the small tells a player can hear and see") imports these two names in
// audioSystem.js but the module was never committed, so audioSystem.js failed to load. This inert
// stub keeps the imports resolvable with the pre-6a9eec796e behaviour: no extra recipe captions,
// and caption text passes through unchanged. Replace it whole with the real module when it lands.

export function emitAdmittedRecipeCaption(_audio, _recipeId, _recipe, _opts, _busName) {}

/** @returns {string} the caption text, unchanged */
export function localizedCaptionText(text, _clock) {
  return text;
}
