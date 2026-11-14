// OPENING-3: named cast get a face card; channel noise keeps the plain treatment; a second cast
// line queues behind the first through the Stage's speaker slot.
// Run: node --test test/speaker-card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createStage } from '../src/ui/stage.js';
import { createSpeakerCard, speakerPortrait, castPortraitFor, SPEAKER_SLOT } from '../src/ui/speakerCard.js';

function makeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(), id: '', className: '', textContent: '', children: [], parentNode: null,
    attributes: {}, dataset: {}, style: { setProperty() {} }, listeners: {},
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    append(...k) { k.forEach((c) => this.appendChild(c)); },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    setAttribute(n, v) { this.attributes[n] = String(v); if (n === 'id') this.id = String(v); },
    getAttribute(n) { return this.attributes[n] ?? null; },
    addEventListener() {}, removeEventListener() {},
    contains() { return true; },
  };
  node.classList = {
    add(...n) { node.className = [...new Set([...node.className.split(/\s+/), ...n])].filter(Boolean).join(' '); },
    remove(...n) { node.className = node.className.split(/\s+/).filter((x) => x && !n.includes(x)).join(' '); },
    contains(n) { return node.className.split(/\s+/).includes(n); },
  };
  return node;
}
function makeDoc() {
  const byId = new Map();
  const body = makeNode('body');
  const doc = {
    body, createElement: makeNode,
    getElementById: (id) => byId.get(id) || null,
  };
  const root = makeNode(); root.id = 'ui-root'; byId.set('ui-root', root);
  return doc;
}
const find = (el, cls) => (el.classList?.contains(cls) ? el : (el.children || []).map((c) => find(c, cls)).find(Boolean) || null);

test('sender names map to the existing portrait registry', () => {
  assert.equal(speakerPortrait('KESSLER'), 'assets/portraits/portrait_kessler.jpg');
  assert.equal(speakerPortrait('KESSLER DESK'), 'assets/portraits/portrait_kessler.jpg');
  assert.equal(speakerPortrait('Coldburn Rey'), 'assets/portraits/portrait_coldburn_rey.jpg');
  assert.equal(speakerPortrait('Prof. Halev Doss'), 'assets/portraits/portrait_halev_doss.jpg');
  assert.equal(speakerPortrait('contact_maera_vols'), 'assets/portraits/portrait_maera_vols.jpg');
  assert.equal(speakerPortrait('Mara and the Children'), 'assets/portraits/portrait_mara_children.jpg');
  assert.equal(speakerPortrait('TRAFFIC'), null);
  assert.equal(speakerPortrait('THE BOOK'), null);
});

test('cast line makes a card with the portrait; noise makes none', () => {
  const doc = makeDoc();
  const stage = createStage({ document: doc });
  const card = createSpeakerCard({ document: doc, stage }, { holdMs: 5, fadeMs: 1 });
  assert.equal(card.show({ sender: 'TRAFFIC', category: 'ambient', text: 'Lane 4 is clear.' }), false);
  assert.equal(card.show({ sender: 'KESSLER', category: 'ambient', text: 'chatter' }), false);
  assert.equal(stage.has(SPEAKER_SLOT), false);
  assert.equal(card.show({ sender: 'KESSLER', category: 'story', text: 'Sample the variance.' }), true);
  const el = find(doc.getElementById('ui-root'), 'sf-speaker');
  const face = find(el, 'sf-speaker__face');
  assert.equal(face.attributes.src, 'assets/portraits/portrait_kessler.jpg');
  assert.equal(find(el, 'sf-speaker__name').textContent, 'KESSLER');
  assert.equal(find(el, 'sf-speaker__line').textContent, 'Sample the variance.');
  card.destroy();
});

test('a second cast line waits for the first, then takes the seat', async () => {
  const doc = makeDoc();
  const stage = createStage({ document: doc });
  const card = createSpeakerCard({ document: doc, stage }, { holdMs: 150, fadeMs: 20 });
  card.show({ sender: 'KESSLER', category: 'story', text: 'One.' });
  card.show({ sender: 'ROOK', category: 'story', text: 'Two.' });
  assert.equal(stage.visible(SPEAKER_SLOT).length, 1);
  assert.equal(stage.queued(SPEAKER_SLOT).length, 1);
  await new Promise((r) => setTimeout(r, 220));
  assert.equal(stage.queued(SPEAKER_SLOT).length, 0);
  const visibleLine = find(doc.getElementById('ui-root'), 'sf-speaker__line');
  assert.equal(visibleLine?.textContent, 'Two.');
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(stage.has(SPEAKER_SLOT), false);
  assert.equal(castPortraitFor({ sender: 'KESSLER', category: 'story', text: '' }), null);
  card.destroy();
});
