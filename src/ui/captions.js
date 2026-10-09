/**
 * PQ-165.01 — captions for every voiced bark and optional audio cues.
 * Presentation only. When accessibility.captions is off, records still exist
 * but must not be shown.
 */
import { BARKS, BARK_FACTIONS, BARK_SITUATIONS, barkFor } from '../data/barks.js';
import { enumerateBarkPipeline, resolveBarkVoice } from '../audio/barkVoice.js';
import { masslineInstrumentCaption, resolveMasslineInstrument } from '../audio/masslineInstrument.js';

export const CAPTIONS_SEED = 16501;

export const AUDIO_CUE_CAPTIONS = Object.freeze({
  well: 'Gravity well',
  repulsor: 'Repulsor deployed',
  cone: 'Cone deployed',
  skim: 'Skim sheet deployed',
  seed: 'Seed deployed',
  taut: 'Line taut',
  tetherTaut: 'Line taut',
  telegraph: 'Incoming telegraph',
});

export const ACCESSIBILITY_AUDIO_CUE_TABLE = Object.freeze({
  well: Object.freeze({
    id: 'a11y.well', kind: 'well', recipeId: 'sfx_field_deploy_well', caption: AUDIO_CUE_CAPTIONS.well,
  }),
  repulsor: Object.freeze({
    id: 'a11y.repulsor', kind: 'repulsor', recipeId: 'sfx_field_deploy_repulsor', caption: AUDIO_CUE_CAPTIONS.repulsor,
  }),
  cone: Object.freeze({
    id: 'a11y.cone', kind: 'cone', recipeId: 'sfx_field_deploy_cone', caption: AUDIO_CUE_CAPTIONS.cone,
  }),
  skim: Object.freeze({
    id: 'a11y.skim', kind: 'skim', recipeId: 'sfx_field_deploy_skim', caption: AUDIO_CUE_CAPTIONS.skim,
  }),
  seed: Object.freeze({
    id: 'a11y.seed', kind: 'seed', recipeId: 'sfx_field_deploy_seed', caption: AUDIO_CUE_CAPTIONS.seed,
  }),
  taut: Object.freeze({
    id: 'a11y.tether_taut', kind: 'taut', recipeId: 'sfx_doctrine_tether_spool', caption: AUDIO_CUE_CAPTIONS.taut,
  }),
  telegraph: Object.freeze({
    id: 'a11y.telegraph', kind: 'telegraph', recipeId: 'sfx_encounter_escalation', caption: AUDIO_CUE_CAPTIONS.telegraph,
  }),
});

function audioCuesOn(flagOrSettings) {
  if (typeof flagOrSettings === 'boolean') return flagOrSettings;
  if (!flagOrSettings) return true;
  const ac = flagOrSettings.accessibility || flagOrSettings;
  return ac.audioCues !== false;
}

export function captionRecordForBarkLine(text, extra = {}) {
  return {
    text: String(text || ''),
    channel: 'bark',
    hidden: extra.captions === false,
    ...extra,
  };
}

export function captionRecordsForAllBarkForLines() {
  const records = [];
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    if (!pack) continue;
    for (const situation of BARK_SITUATIONS) {
      const lines = pack[situation] || [];
      for (let i = 0; i < lines.length; i++) {
        const text = barkFor(factionId, situation, i);
        records.push(captionRecordForBarkLine(text, { factionId, situation, index: i }));
      }
    }
  }
  return records;
}

export function captionForBark(factionId, situation, rng) {
  const line = barkFor(factionId, situation, rng);
  const spoken = resolveBarkVoice({ factionId, situation, line });
  return {
    text: spoken.caption || line,
    channel: 'bark',
    factionId,
    situation,
    registerId: spoken.registerId,
  };
}

export function everyVoicedBarkCaptioned() {
  const fromBarkFor = captionRecordsForAllBarkForLines();
  if (!fromBarkFor.length || fromBarkFor.some((row) => !row.text)) return false;
  const rows = enumerateBarkPipeline();
  return rows.length > 0 && rows.every((row) => typeof row.caption === 'string' && row.caption.length > 0);
}

export function resolveAccessibilityCue(kind, flagOrSettings) {
  if (!audioCuesOn(flagOrSettings)) return null;
  const key = kind === 'tetherTaut' ? 'taut' : kind;
  return ACCESSIBILITY_AUDIO_CUE_TABLE[key] || null;
}

export function audioCueCaption(kind, audioCuesFlag) {
  const cue = resolveAccessibilityCue(kind, audioCuesFlag);
  if (!cue) return null;
  return { text: cue.caption, channel: 'cue', kind: cue.kind };
}

export function captionMasslineEvent(eventName, payload, captionsOn) {
  const voice = resolveMasslineInstrument({ event: eventName, payload });
  if (!voice) return null;
  const text = voice.caption || masslineInstrumentCaption(voice.event);
  if (captionsOn === false) return { text, hidden: true, channel: 'massline' };
  return { text, hidden: false, channel: 'massline' };
}

const UI_BLIP_IDS = new Set([
  'sfx_ui_open', 'sfx_ui_back', 'sfx_ui_tab', 'sfx_ui_confirm', 'sfx_ui_error', 'sfx_ui_hover',
]);

const EXPLICIT_RECIPE_CAPTIONS = Object.freeze({
  sfx_refusal_empty: Object.freeze({ text: 'No ammunition.', urgency: 'high', event: 'refusal.ammo' }),
  sfx_refusal_target: Object.freeze({ text: 'No valid target.', urgency: 'high', event: 'refusal.target' }),
  sfx_massline_deny: Object.freeze({ text: 'Action refused.', urgency: 'high', event: 'refusal' }),
  sfx_fuel_reserve: Object.freeze({ text: 'Fuel reserve.', urgency: 'warn', event: 'fuel.reserve' }),
  sfx_fuel_empty: Object.freeze({ text: 'Fuel empty.', urgency: 'high', event: 'fuel.empty' }),
  sfx_work_motor: Object.freeze({ text: 'Machine working.', urgency: 'normal', event: 'work.running' }),
  sfx_work_jam: Object.freeze({ text: 'Machine jammed.', urgency: 'warn', event: 'work.jam' }),
  sfx_anomaly_swell: Object.freeze({ text: 'Anomaly evidence.', urgency: 'normal', event: 'anomaly.evidence' }),
  sfx_kill_sine: Object.freeze({ text: 'Light kill.', urgency: 'high', event: 'kill.light' }),
  sfx_kill_noise: Object.freeze({ text: 'Heavy kill.', urgency: 'high', event: 'kill.heavy' }),
  'sfx.killSmall': Object.freeze({ text: 'Kill.', urgency: 'high', event: 'kill' }),
  sfx_kill_confirm: Object.freeze({ text: 'Kill confirmed.', urgency: 'high', event: 'kill.confirm' }),
  'sfx.killConfirmed': Object.freeze({ text: 'Kill confirmed.', urgency: 'high', event: 'kill.confirm' }),
  'sfx.killCapital': Object.freeze({ text: 'Capital destroyed.', urgency: 'high', event: 'kill.capital' }),
  sfx_massline_release: Object.freeze({ text: 'Massline release.', urgency: 'normal', event: 'massline.release' }),
  'sfx.tetherSnap': Object.freeze({ text: 'Massline break.', urgency: 'high', event: 'massline.break' }),
  sfx_cash_register: Object.freeze({ text: 'Credits received.', urgency: 'normal', event: 'money.register' }),
  sfx_mission_accept: Object.freeze({ text: 'Mission accepted.', urgency: 'normal', event: 'mission.accept' }),
  sfx_mission_complete: Object.freeze({ text: 'Mission complete.', urgency: 'normal', event: 'mission.complete' }),
  'sfx.cruiseEngaged': Object.freeze({ text: 'Cruise engaged.', urgency: 'normal', event: 'cruise' }),
  sfx_field_loop_well: Object.freeze({ text: 'Gravity well holding.', urgency: 'normal', event: 'field.well' }),
  sfx_field_loop_repulsor: Object.freeze({ text: 'Repulsor holding.', urgency: 'normal', event: 'field.repulsor' }),
  sfx_field_loop_cone: Object.freeze({ text: 'Cone holding.', urgency: 'normal', event: 'field.cone' }),
});

export function isUiBlipRecipe(recipeId) {
  return UI_BLIP_IDS.has(String(recipeId || ''));
}

function familyCaption(recipeId, recipe) {
  const family = (recipe && recipe.category) || 'cue';
  const words = String(recipeId || '')
    .replace(/^sfx[._]/, '')
    .replace(/[._]/g, ' ')
    .trim();
  const text = words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : 'Cue.';
  const urgency = family === 'explosion' || family === 'weapon' ? 'high'
    : family === 'comms' ? 'speech' : 'normal';
  return { text, urgency, event: family };
}

/** FB-123 — every non-blip recipe resolves to a caption. Missing rows fall back to the family. */
export function captionForGameplayRecipe(recipeId, recipe) {
  if (!recipeId || isUiBlipRecipe(recipeId)) return null;
  const explicit = EXPLICIT_RECIPE_CAPTIONS[recipeId];
  const family = explicit || familyCaption(recipeId, recipe);
  return Object.freeze({
    recipeId,
    text: family.text,
    urgency: family.urgency,
    event: family.event,
  });
}

export function fieldDeployCaption(kind, flagOrSettings) {
  if (flagOrSettings) {
    const ac = flagOrSettings.accessibility || flagOrSettings;
    if (ac.captions === false) return null;
  }
  const caption = AUDIO_CUE_CAPTIONS[kind];
  if (!caption) return null;
  return { text: caption, channel: 'cue', kind };
}

