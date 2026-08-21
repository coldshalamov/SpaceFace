// Listener-relative audio residency. Distant world mix stays abstract;
// combat and UI voices stay exact.

import { PRESENTATION_TIER } from '../world/activityClassification.js';

export function entityNeedsExactAudio(entity, options = {}) {
  if (!entity || entity.alive === false) return false;
  if (entity.isPlayer === true || entity.id === options.playerId) return true;
  if (options.combatId != null && entity.id === options.combatId) return true;
  if (options.uiVoiceId != null && entity.id === options.uiVoiceId) return true;
  const tier = entity.activity && entity.activity.presentationTier;
  return tier === PRESENTATION_TIER.R0_GLASS || tier === PRESENTATION_TIER.R1_RUNWAY;
}
