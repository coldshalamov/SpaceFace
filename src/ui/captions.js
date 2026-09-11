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
  taut: 'Line taut',
  tetherTaut: 'Line taut',
  telegraph: 'Incoming telegraph',
});

export const ACCESSIBILITY_AUDIO_CUE_TABLE = Object.freeze({
  well: Object.freeze({
    id: 'a11y.well', kind: 'well', recipeId: 'sfx_anomaly_swell', caption: AUDIO_CUE_CAPTIONS.well,
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
