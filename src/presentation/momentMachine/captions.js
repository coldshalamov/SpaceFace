// Sidecar captions cite the logged reason. They do not read free-text narration fields.

import { MOMENT_CAPTION_SCHEMA, TICK_RATE } from './contract.js';

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

function cueText(moment) {
  const label = moment && moment.label ? moment.label : 'Moment';
  const reason = moment && typeof moment.reason === 'string' ? moment.reason : '';
  const gap = moment && moment.footage && moment.footage.status && moment.footage.status !== 'covered'
    ? ` Recorded footage: ${moment.footage.status}.`
    : '';
  return `${label}. ${reason}${gap}`.trim();
}

export function captionSidecar(moment, plan) {
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
    language: 'en',
    soundtrack: null,
    cues: [{
      startS,
      endS,
      text: cueText(moment),
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
