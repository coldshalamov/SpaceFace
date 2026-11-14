// src/ui/speakerCard.js — the story's people get faces (design/game/16 "The cast gets faces",
// design/game/20 rule 1 + 2). When a NAMED cast member speaks through comms, one compact card
// carries their portrait, their name and their one line, then leaves. Generic channel noise
// (traffic, barks, machine chatter) has no portrait and keeps the plain comms treatment.
//
// The sender -> portrait map is the existing registry (src/data/portraits.js); this file invents
// no second table. The Stage's `speaker` slot (maxVisible 1) is the queue: a second cast line
// waits until the first card has left.
import { CANONICAL_PORTRAITS, NAMED_CONTACT_PORTRAITS, PORTRAIT_ASSET_ROOT } from '../data/portraits.js';
import { getStage } from './stage.js';

export const SPEAKER_HOLD_MS = 6000;
export const SPEAKER_FADE_MS = 320;
export const SPEAKER_SLOT = 'speaker';
// Cast speak in these channels; ambient/machine/ecology/alert traffic never wears a face.
const CAST_CATEGORIES = new Set(['story', 'personal', 'late']);
const HONORIFICS = new Set(['prof', 'professor', 'captain', 'capt', 'dr', 'doctor', 'boss', 'clerk', 'warrant', 'director']);
const FILLER = new Set(['and', 'the']);

// slug -> file, from the two registries the Codex and the bar already read.
const PORTRAIT_BY_SLUG = (() => {
  const map = new Map();
  for (const [key, file] of Object.entries(NAMED_CONTACT_PORTRAITS)) map.set(key.replace(/^contact_/, ''), file);
  for (const [key, file] of Object.entries(CANONICAL_PORTRAITS)) map.set(key, file);
  return map;
})();

function slugWords(sender) {
  return String(sender || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Portrait URL for a speaker name ("KESSLER", "Coldburn Rey", "contact_halev_doss") or null. */
export function speakerPortrait(sender) {
  let words = slugWords(sender);
  if (words[0] === 'contact') words = words.slice(1);
  const tries = [];
  const push = (list) => { if (list.length) tries.push(list.join('_')); };
  push(words);
  const noFiller = words.filter((w) => !FILLER.has(w));
  push(noFiller);
  const noDesk = noFiller.filter((w) => w !== 'desk');
  push(noDesk);
  push(noDesk.filter((w, i) => !(i === 0 && HONORIFICS.has(w))));
  for (const slug of tries) {
    const file = PORTRAIT_BY_SLUG.get(slug);
    if (file) return PORTRAIT_ASSET_ROOT + file;
  }
  return null;
}

/** A payload is a cast line when its channel is spoken and its sender owns a face. */
export function castPortraitFor(payload) {
  if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) return null;
  if (!CAST_CATEGORIES.has(payload.category || 'ambient')) return null;
  return speakerPortrait(payload.sender);
}

export function createSpeakerCard(ctx = {}, { holdMs = SPEAKER_HOLD_MS, fadeMs = SPEAKER_FADE_MS } = {}) {
  const doc = ctx.document || (typeof document !== 'undefined' ? document : null);
  const timers = new Set();
  let seq = 0;
  let destroyed = false;
  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };
  const stageNow = () => ctx.stage || getStage();

  function build(payload, src) {
    const card = doc.createElement('div');
    card.className = 'sf-speaker';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    const face = doc.createElement('img');
    face.className = 'sf-speaker__face';
    face.setAttribute('src', src);
    face.setAttribute('alt', '');
    face.setAttribute('width', '60');
    face.setAttribute('height', '60');
    face.setAttribute('draggable', 'false');
    face.addEventListener('error', () => { card.classList.add('sf-speaker--faceless'); });
    const text = doc.createElement('div');
    text.className = 'sf-speaker__text';
    const name = doc.createElement('span');
    name.className = 'sf-speaker__name';
    name.textContent = String(payload.sender || '');
    const line = doc.createElement('span');
    line.className = 'sf-speaker__line';
    line.textContent = String(payload.text);
    text.append(name, line);
    card.append(face, text);
    return card;
  }

  /** Show a cast line as a face card. Returns false (caller keeps the plain treatment) when it is not one. */
  function show(payload) {
    if (destroyed || !doc) return false;
    const src = castPortraitFor(payload);
    const stage = stageNow();
    if (!src || !stage) return false;
    const id = `sf-speaker-${++seq}`;
    const card = build(payload, src);
    const leave = () => {
      card.classList.add('sf-speaker--out');
      later(() => { stage.clear(SPEAKER_SLOT, id); }, fadeMs);
    };
    // The hold starts when the seat is taken, so a queued line gets its full time on screen.
    const handle = stage.show(SPEAKER_SLOT, card, {
      id, severity: 'info', bare: true,
      onMount: () => { card.classList.add('sf-speaker--in'); later(leave, holdMs); },
    });
    return !!handle;
  }

  return {
    show,
    destroy() {
      destroyed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      const stage = stageNow();
      try { while (stage && stage.has(SPEAKER_SLOT) && stage.clear(SPEAKER_SLOT)) { /* drain */ } } catch (_) { /* gone */ }
    },
  };
}
