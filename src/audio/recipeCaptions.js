import { captionForGameplayRecipe, formatCaptionText, isUiBlipRecipe } from '../ui/captions.js';
import { gameLocalization, localizeText } from '../localization/gameLocalization.js';

// These sounds already have a receipt/voice-owned caption. Their semantic owner also
// works when the sound is muted, and keeps physical flashes out of the visible floor.
const RECEIPT_CAPTIONED = new Set([
  'sfx_mission_accept', 'sfx_mission_complete', 'sfx_tech_researched', 'sfx_ship_purchased',
  'sfx_achievement_fanfare', 'sfx_promotion_chord', 'sfx_cash_register',
  'sfx_fuel_reserve', 'sfx_fuel_empty', 'sfx_anomaly_swell',
  'sfx_field_deploy_well', 'sfx_field_deploy_repulsor', 'sfx_field_deploy_cone',
  'sfx_field_deploy_skim', 'sfx_field_deploy_seed',
  'sfx.shieldHit', 'sfx.armorHit', 'sfx.hullHit', 'sfx.shieldBreak', 'sfx_explosion_small', 'sfx.killConfirmed',
]);

export function localizedCaptionText(text, clock) {
  // English stays on the cheap literal path; other languages use the same reviewed
  // phrase/catalog pipeline as the rest of the interface, including its preview rules.
  const bearing = Number.isInteger(clock) && clock >= 1 && clock <= 12 ? clock : undefined;
  return formatCaptionText(text, bearing, gameLocalization.locale === 'en-US' ? undefined : localizeText);
}

export function emitAdmittedRecipeCaption(owner, recipeId, recipe, opts, busName) {
  if (owner.state?.settings?.accessibility?.captions === false || opts?.captionOwned
    || busName === 'comms' || isUiBlipRecipe(recipeId) || RECEIPT_CAPTIONED.has(recipeId)) return null;
  const player = owner.state?.entities?.get?.(owner.state.playerId);
  const listener = player?.pos ? { ...player.pos, rot: player.rot } : null;
  const caption = captionForGameplayRecipe(recipeId, recipe, { position: opts?.position, listener });
  if (!caption) return null;
  const now = owner.rt?.ctx?.currentTime ?? owner.state?.simTime ?? 0;
  const recent = owner.rt._recipeCaptionTimes ||= new Map();
  const key = `${recipeId}:${caption.clock || ''}`;
  if (recent.has(key) && now - recent.get(key) < 1.2 && now >= recent.get(key)) return null;
  recent.set(key, now);
  if (recent.size > 128) recent.delete(recent.keys().next().value);
  owner._emitPresentationCaption(caption.baseText, {
    channel: 'cue', recipeId, authored: caption.authored, clock: caption.clock,
    assertive: caption.urgency === 'high' || caption.urgency === 'warn',
    physical: recipe.category === 'weapon' || recipe.category === 'explosion',
    showVisible: recipe.category !== 'weapon' && recipe.category !== 'explosion',
  });
  return caption;
}
