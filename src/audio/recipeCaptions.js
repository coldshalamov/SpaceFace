// Caption only a voice admitted by audio.play. The caller owns audibility and voice budgets;
// this adapter owns no timers, audio nodes, simulation state, or second event subscription.
import { captionForGameplayRecipe } from '../ui/captions.js';
import { localizeText } from '../localization/gameLocalization.js';

export function localizedCaptionText(text, clock) {
  if (!text) return '';
  if (!Number.isInteger(clock) || clock < 1 || clock > 12) return localizeText(text);
  const caption = localizeText(text).replace(/[.\s]+$/, '');
  return localizeText("{caption}, {clock} o'clock.", { caption, clock });
}

export function emitAdmittedRecipeCaption(owner, recipeId, recipe, opts = {}, busName) {
  // Named event captions and deliberately wordless cues already own this moment. In
  // particular, a mining-danger siren must never inherit the wanted-alert sentence.
  if (!owner || typeof owner._emitPresentationCaption !== 'function'
    || opts.captionOwned === true
    || owner.state?.settings?.accessibility?.captions === false) return null;
  // Resolve the authored base text without a position. _emitPresentationCaption owns
  // the ship-relative clock and localization, so neither can be appended twice.
  const caption = captionForGameplayRecipe(recipeId, recipe);
  if (!caption) return null; // The canonical resolver excludes UI blips.
  owner._emitPresentationCaption(caption.text, {
    channel: 'cue',
    recipeId: caption.recipeId,
    urgency: caption.urgency,
    event: caption.event,
    assertive: caption.urgency === 'high' || caption.urgency === 'warn',
    position: opts.position || null,
    ...(opts.clock ? { clock: opts.clock } : {}),
  });
  return caption;
}
