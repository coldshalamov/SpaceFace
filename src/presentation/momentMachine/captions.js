// Sidecar captions cite the logged reason. They do not read free-text narration fields.

import { MOMENT_CAPTION_SCHEMA, TICK_RATE } from './contract.js';
import { translateMessage } from '../../localization/pipeline.js';

// Editorial shapes are semantic keys, not English narration to machine-translate.
// A localized caption cites the exact logged event/causality identities. The full
// diagnostic English reason remains on the moment; it is never relabelled German.
const SHAPE_COPY = {
  chain_collision: ['Kettenkollision', 'Colisión en cadena', 'Collision en chaîne', 'Colisão em cadeia'],
  impossible_tether_cut: ['Seil unter Last getrennt', 'Cable cortado bajo carga', 'Câble sectionné sous charge', 'Cabo cortado sob carga'],
  accidental_collateral: ['Unbeabsichtigter Kollateralschaden', 'Daño colateral accidental', 'Dégâts collatéraux accidentels', 'Dano colateral acidental'],
  dramatic_lawful_intervention: ['Eingreifen der Sicherheitskräfte', 'Intervención de seguridad', 'Intervention des forces de sécurité', 'Intervenção de segurança'],
  giant_sling: ['Schleuderwurf mit Einschlag', 'Lanzamiento con impacto', 'Lancer avec impact', 'Arremesso com impacto'],
  last_second_rescue: ['Rettung in letzter Sekunde', 'Rescate en el último segundo', 'Sauvetage de dernière seconde', 'Resgate no último segundo'],
  near_miss: ['Beinahetreffer', 'Casi impacto', 'Impact évité de justesse', 'Quase colisão'],
  volatile_cargo_catastrophe: ['Explosion flüchtiger Fracht', 'Explosión de carga volátil', 'Explosion de cargaison volatile', 'Explosão de carga volátil'],
  moving_blockade: ['Bewegliche Blockade', 'Bloqueo móvil', 'Blocus mobile', 'Bloqueio móvel'],
  reversal: ['Rollenwechsel', 'Cambio de papeles', 'Renversement des rôles', 'Inversão de papéis'],
  freak_ricochet: ['Abpraller', 'Rebote', 'Ricochet', 'Ricochete'],
  unplanned_recovery: ['Ungeplante Bergung', 'Recuperación imprevista', 'Récupération imprévue', 'Recuperação imprevista'],
  logged_kill: ['Aufgezeichnete Zerstörung', 'Destrucción registrada', 'Destruction enregistrée', 'Destruição registrada'],
  logged_stunt: ['Aufgezeichnetes Flugmanöver', 'Maniobra registrada', 'Manœuvre enregistrée', 'Manobra registrada'],
};
const LOCALE_COLUMN = { de: 0, es: 1, fr: 2, pt: 3 };
const EVIDENCE_COPY = [
  ['Ereignisse', 'Ursache', 'Aufnahme unvollständig'],
  ['Sucesos', 'Causa', 'Grabación incompleta'],
  ['Événements', 'Cause', 'Enregistrement incomplet'],
  ['Eventos', 'Causa', 'Gravação incompleta'],
];

function clock(seconds) {
  const safe = Math.max(0, seconds);
  const whole = Math.floor(safe);
  const ms = Math.round((safe - whole) * 1000);
  const hh = String(Math.floor(whole / 3600)).padStart(2, '0');
  const mm = String(Math.floor((whole % 3600) / 60)).padStart(2, '0');
  const ss = String(whole % 60).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${mmm}`;
}

function cueText(moment, locale) {
  const column = LOCALE_COLUMN[String(locale).split(/[-_]/)[0].toLowerCase()];
  const localized = SHAPE_COPY[moment?.shape]?.[column];
  if (localized) {
    const copy = EVIDENCE_COPY[column], parts = [localized];
    if (moment.eventIds?.length) parts.push(`${copy[0]}: ${moment.eventIds.join(', ')}`);
    if (moment.causalityId) parts.push(`${copy[1]}: ${moment.causalityId}`);
    if (moment.footage?.status && moment.footage.status !== 'covered') parts.push(copy[2]);
    return parts.join('. ') + '.';
  }
  const label = moment && moment.label ? moment.label : 'Moment';
  const reason = moment && typeof moment.reason === 'string' ? moment.reason : '';
  const gap = moment && moment.footage && moment.footage.status && moment.footage.status !== 'covered'
    ? ` Recorded footage: ${moment.footage.status}.`
    : '';
  return [label, reason, gap.trim()].filter(Boolean)
    .map((part) => translateMessage(locale, part)).join('. ').trim();
}

export function captionSidecar(moment, plan, { locale = 'en-US', soundtrack = null } = {}) {
  const span = plan && plan.exportSpan && plan.exportSpan.exportable
    ? plan.exportSpan
    : null;
  const startTick = span ? span.inTick : moment.inTick;
  const endTick = span ? span.outTick : moment.outTick;
  const startS = 0;
  const endS = Math.max(0, (endTick - startTick + 1) / TICK_RATE);
  return {
    schema: MOMENT_CAPTION_SCHEMA,
    momentId: moment.id,
    language: String(locale).split(/[-_]/)[0].toLowerCase(),
    soundtrack,
    cues: [{
      startS,
      endS,
      text: cueText(moment, locale),
    }],
  };
}

export function captionVtt(sidecar) {
  const cues = sidecar && Array.isArray(sidecar.cues) ? sidecar.cues : [];
  const lines = ['WEBVTT', ''];
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    lines.push(`${clock(cue.startS)} --> ${clock(cue.endS)}`);
    lines.push(String(cue.text || ''));
    lines.push('');
  }
  return lines.join('\n');
}
