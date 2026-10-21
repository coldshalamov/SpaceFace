// RC-44: stunt callouts weigh by rarity — a legendary act lands heavier than a
// common one (data-rarity on the line, a weight ladder in the sheet).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStuntCallout } from '../src/ui/stuntCallout.js';

function fakeElement(tag) {
  const el = {
    tag, children: [], attributes: {}, className: '', textContent: '', hidden: false,
    parentNode: null,
    classList: {
      add(...names) { for (const n of names) if (!el._classes.has(n)) el._classes.add(n); },
      remove(...names) { for (const n of names) el._classes.delete(n); },
      contains(name) { return el._classes.has(name); },
      toggle(name, on) { const want = on === undefined ? !el._classes.has(name) : !!on; if (want) el._classes.add(name); else el._classes.delete(name); return want; },
    },
    _classes: new Set(),
    style: { setProperty() {}, removeProperty() {}, display: '', left: '' },
    setAttribute(name, value) { el.attributes[name] = String(value); },
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; return child; },
    querySelector() { return null; },
  };
  return el;
}

function fakeDocument() {
  const doc = { head: fakeElement('head'), body: fakeElement('body'), documentElement: fakeElement('html') };
  doc.getElementById = () => null;
  doc.createElement = (tag) => fakeElement(tag);
  return doc;
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
      return () => handlers.get(event)?.delete(cb);
    },
    emit(event, payload) { for (const cb of handlers.get(event) || []) cb(payload); },
  };
}

const state = {
  run: null, mode: 'flight', ui: { screenStack: [] }, tick: 600, playerId: 1,
  stunts: null, settings: { video: { motionReduce: false } },
};

function trick(trickId, name, rarity, episodeId) {
  return {
    schemaVersion: 2, actorId: 1, trickId, name, rarity, family: 'field', episodeId, tick: 600,
    modifiers: {}, metrics: {},
  };
}

function lineNodes(root) {
  const lines = root.children.find((c) => c.className.includes('sf-stuntcall__lines'));
  return lines ? lines.children : [];
}

test('RC-44: SLINGSHOT GOLF lands heavier than ROCK DISCOVERY', () => {
  const bus = fakeBus();
  const owner = createStuntCallout({ state, bus, doc: fakeDocument() });
  bus.emit('stunt:trickDetected', trick('rock_discovery', 'Rock Discovery', 'common', 'ep-rock'));
  bus.emit('stunt:trickDetected', trick('slingshot_golf', 'Slingshot Golf', 'legendary', 'ep-sling'));
  owner.update(0);
  const lines = lineNodes(owner.root);
  const byName = (frag) => lines.find((l) =>
    l.children.some((c) => typeof c.textContent === 'string' && c.textContent.toLowerCase().includes(frag)));
  assert.equal(byName('rock discovery').attributes['data-rarity'], 'common');
  assert.equal(byName('slingshot golf').attributes['data-rarity'], 'legendary');

  // The sheet carries a strict weight ladder; rarity is an attribute, not a new surface.
  const src = readFileSync(fileURLToPath(new URL('../src/ui/stuntCallout.js', import.meta.url)), 'utf8');
  for (const rarity of ['common', 'uncommon', 'legendary']) {
    assert.match(src, new RegExp(`data-rarity="${rarity}"`), `sheet styles ${rarity}`);
  }
  const weightOf = (r) => Number(src.match(new RegExp(`data-rarity="${r}"[^}]*font-weight:(\\d+)`))[1]);
  assert.ok(weightOf('common') < weightOf('legendary'), 'legendary reads heavier than common');
});
