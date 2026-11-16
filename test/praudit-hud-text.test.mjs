import test from 'node:test';
import assert from 'node:assert/strict';
import { setText } from '../src/ui/hud.js';

function element(children = []) {
  let replacements = 0;
  return {
    children,
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children.at(-1) || null; },
    get textContent() { return this.children.map(node => node.data || '').join(''); },
    set textContent(value) {
      replacements++;
      const text = value == null ? '' : String(value);
      this.children = text ? [{ nodeType: 3, data: text }] : [];
    },
    get replacements() { return replacements; },
  };
}

test('HUD text updates retain the existing text node and skip unchanged values', () => {
  const el = element();
  setText(el, '◆ BEACON · 457');
  const textNode = el.firstChild;
  setText(el, '◆ BEACON · 457');
  assert.equal(el.replacements, 1);
  setText(el, '◆ BEACON · 456');
  assert.equal(el.firstChild, textNode);
  assert.equal(el.textContent, '◆ BEACON · 456');
  assert.equal(el.replacements, 1);
});

test('HUD text replacement still clears and replaces structured content', () => {
  const el = element([{ nodeType: 1, data: 'old' }, { nodeType: 3, data: ' text' }]);
  setText(el, 'Objective');
  assert.equal(el.textContent, 'Objective');
  assert.equal(el.replacements, 1);
  setText(el, '');
  assert.equal(el.textContent, '');
  assert.equal(el.firstChild, null);
  assert.equal(el.replacements, 2);
  setText(el, null);
  assert.equal(el.textContent, '');
});
