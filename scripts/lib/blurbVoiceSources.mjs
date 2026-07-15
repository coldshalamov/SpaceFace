import { createHash } from 'node:crypto';

import {
  BEAT_COMMS,
  CONTACT_CARDS,
} from '../../src/story/campaign47a/embodiedDialogue.js';
import { FLAVOR_TEXT_ENTRIES } from '../../src/data/flavor/index.generated.js';
import { UNIQUE_WRECKS } from '../../src/data/uniqueWrecks.js';

export function collectBlurbVoiceEntries() {
  return [
    ...CONTACT_CARDS.map((entry) => ({
      key: `src/story/campaign47a/embodiedDialogue.js#CONTACT_CARDS#${entry.id}#blurb`,
      id: entry.id,
      kind: 'contact_blurb',
      text: entry.blurb,
    })),
    ...BEAT_COMMS.map((entry) => ({
      key: `src/story/campaign47a/embodiedDialogue.js#BEAT_COMMS#${entry.id}#text`,
      id: entry.id,
      kind: 'comms',
      text: entry.text,
    })),
    ...FLAVOR_TEXT_ENTRIES.map((entry) => ({
      key: entry.key,
      id: entry.id,
      kind: 'flavor',
      text: entry.text,
    })),
    ...UNIQUE_WRECKS.map((entry) => ({
      key: `src/data/uniqueWrecks.js#followup#${entry.followup.id}`,
      id: entry.followup.id,
      kind: 'unique_wreck_followup',
      text: entry.followup.text,
    })),
  ];
}

export function blurbVoiceHash(entry) {
  return createHash('sha256')
    .update(`${entry.kind || ''}\0${entry.text || ''}`, 'utf8')
    .digest('hex');
}

export function selectChangedBlurbEntries(entries, baselineEntries = {}) {
  return (entries || []).filter((entry) => baselineEntries[entry.key] !== blurbVoiceHash(entry));
}

export function makeBlurbVoiceBaseline(entries = collectBlurbVoiceEntries()) {
  return Object.fromEntries(entries.map((entry) => [entry.key, blurbVoiceHash(entry)]));
}
