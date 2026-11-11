// G16-01 the Stage — the one host for every transient popup (design/program/fleet/drafts/
// G16-one-glass.md §4/§6). Headless fake-DOM proofs of the door contract: one visible item per
// slot (toasts: three), queued items order by severity then arrival, unknown slots throw, every
// shown item carries the kit frame, and reduced motion cuts instead of settling.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStage, STAGE_SLOTS, stagePriority } from '../src/ui/stage.js';

function installDom() {
  class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); this._sync(); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); this._sync(); }
    contains(v) { return this.values.has(v); }
    _sync() { this.owner._className = Array.from(this.values).join(' '); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList(this);
      this.attributes = new Map();
      this.listeners = new Map();
      this.dataset = {};
      this._className = '';
      this.id = '';
      this.textContent = '';
      this.nodeType = 1;
      this.style = {
        setProperty: (k, v) => { this.style[k] = v; },
        removeProperty: (k) => { delete this.style[k]; },
      };
      // `hidden` stays undefined until something writes it — cut() is the only motion seam that
      // does, which is what lets the test tell cut from settle.
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v);
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    get isConnected() {
      for (let n = this; n; n = n.parentNode) if (n === doc.documentElement) return true;
      return false;
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    prepend(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.unshift(child);
      return child;
    }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      return child;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }
    removeEventListener() {}
  }
  // The fixture mirrors index.html: documentElement > body > #ui-root > #hud — the same parents
  // the stage mounts its slot containers under.
  const documentElement = new FakeElement('html');
  const body = new FakeElement('body');
  const uiRoot = new FakeElement('div'); uiRoot.id = 'ui-root';
  const hud = new FakeElement('div'); hud.id = 'hud';
  documentElement.appendChild(body);
  body.appendChild(uiRoot);
  uiRoot.appendChild(hud);
  const doc = {
    documentElement,
    body,
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
    // Walks the tree like a real getElementById — a detached (wiped) element is not found.
    getElementById: (id) => {
      const walk = (el) => {
        if (el.id === id) return el;
        for (const c of el.children) { const hit = walk(c); if (hit) return hit; }
        return null;
      };
      return walk(documentElement);
    },
  };
  const previous = { document: globalThis.document, raf: globalThis.requestAnimationFrame };
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 1; // settle schedules; the classes land synchronously.
  return {
    doc, uiRoot, hud,
    restore() {
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
      if (previous.raf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previous.raf;
    },
  };
}

const flowOf = (stage, name) => stage.slotEl(name).children.find(
  (c) => c.classList && c.classList.contains('sf-stage__flow'),
);

test('a slot shows one item; a second waits instead of overlapping', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    const a = stage.show('dialog', 'first card');
    const b = stage.show('dialog', 'second card');
    assert.ok(a.visible, 'the first item mounts');
    assert.ok(b.queued, 'the second item queues');
    assert.equal(flowOf(stage, 'dialog').children.length, 1, 'only one frame is mounted');
    assert.deepEqual(stage.visible('dialog'), [a.id]);
    assert.deepEqual(stage.queued('dialog'), [b.id]);
  } finally { restore(); }
});

test('clear releases the visible item and promotes the queue', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    const a = stage.show('dialog', 'first card');
    const b = stage.show('dialog', 'second card');
    assert.equal(stage.clear('dialog'), true);
    assert.ok(!a.visible && b.visible, 'B now holds the slot');
    assert.equal(flowOf(stage, 'dialog').children.length, 1);
    assert.equal(flowOf(stage, 'dialog').children[0], b.el);
    assert.equal(stage.clear('dialog'), true);
    assert.equal(stage.clear('dialog'), false, 'an empty slot has nothing to clear');
  } finally { restore(); }
});

test('the queue orders by severity (danger > warning > info), then arrival', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    stage.show('dialog', 'first card');
    const info = stage.show('dialog', 'note', { severity: 'info' });
    const danger = stage.show('dialog', 'alarm', { severity: 'danger' });
    const warn = stage.show('dialog', 'caution', { severity: 'warning' });
    assert.deepEqual(stage.queued('dialog'), [danger.id, warn.id, info.id],
      'a later danger still outranks an earlier info');
    stage.clear('dialog');
    assert.deepEqual(stage.visible('dialog'), [danger.id]);
    stage.clear('dialog');
    assert.deepEqual(stage.visible('dialog'), [warn.id]);
    stage.clear('dialog');
    assert.deepEqual(stage.visible('dialog'), [info.id]);
  } finally { restore(); }
});

test('equal severity stays first-come-first-served', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    stage.show('dialog', 'first card');
    const x = stage.show('dialog', 'earlier', { severity: 'info' });
    const y = stage.show('dialog', 'later', { severity: 'info' });
    assert.deepEqual(stage.queued('dialog'), [x.id, y.id]);
  } finally { restore(); }
});

test('the feed slot stacks at most three items', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    const shown = ['a', 'b', 'c', 'd'].map((id) => stage.show('feed', `receipt ${id}`));
    assert.equal(flowOf(stage, 'feed').children.length, 3, 'three stacked, no more');
    assert.deepEqual(stage.visible('feed'), shown.slice(0, 3).map((h) => h.id));
    assert.deepEqual(stage.queued('feed'), [shown[3].id]);
    stage.clear('feed');
    assert.deepEqual(stage.visible('feed'), shown.slice(1).map((h) => h.id),
      'the fourth receipt takes the freed seat');
  } finally { restore(); }
});

test('unknown slot names throw', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    assert.throws(() => stage.show('nowhere', 'x'), /unknown stage slot/);
    assert.throws(() => stage.clear('nowhere'), /unknown stage slot/);
    assert.throws(() => stage.slotEl('nowhere'), /unknown stage slot/);
  } finally { restore(); }
});

test('a component shown through the stage carries the kit frame', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    const card = doc.createElement('div');
    const h = stage.show('dialog', card, { severity: 'danger' });
    assert.ok(h.el.classList.contains('sf-stage__item'), 'the stage frame');
    assert.ok(h.el.classList.contains('dp-glass'), 'the shared glass face');
    assert.ok(h.el.classList.contains('sf-stage__item--danger'), 'the severity mark');
    assert.equal(h.el.children[0], card, 'the component mounts inside its frame');
  } finally { restore(); }
});

test('reduced motion uses cut — no entrance settle', () => {
  const { doc, restore } = installDom();
  try {
    doc.documentElement.classList.add('sf-reduce-motion');
    const stage = createStage({ document: doc });
    const h = stage.show('dialog', 'card');
    assert.strictEqual(h.el.hidden, false, 'cut wrote hidden — settle never touches it');
    assert.ok(!h.el.classList.contains('k-in'), 'no k-in entrance under reduced motion');
    assert.equal(h.el.dataset.kMotionState, 'stage-show');
  } finally { restore(); }
});

test('ordinary motion settles the item in through the kit seam', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    const h = stage.show('dialog', 'card');
    assert.ok(h.el.classList.contains('k-in'), 'the entrance classes landed');
    assert.ok(h.el.classList.contains('k-in--bottom'), 'the dialog slot enters from the bottom');
    assert.equal(h.el.dataset.kMotionState, 'stage-show');
  } finally { restore(); }
});

test('re-showing an id replaces it; a handle clears its own item', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    stage.show('banner', 'old warning', { id: 'w1', severity: 'warn' });
    const h = stage.show('banner', 'new warning', { id: 'w1', severity: 'danger' });
    assert.equal(stage.visible('banner').length, 1, 'one popup, not two');
    assert.equal(stage.clear('banner', 'w1'), true);
    stage.show('dialog', 'card', { id: 'd1' });
    const gone = stage.clear('dialog', 'd1');
    assert.equal(gone, true);
    assert.equal(stage.has('dialog'), false);
    const kept = stage.show('feed', 'line', { id: 'r1' });
    assert.equal(kept.clear(), true, 'the handle releases its own item');
  } finally { restore(); }
});

test('slot containers self-attach to their authored parents and survive a hud wipe', () => {
  const { doc, uiRoot, hud, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    assert.equal(stage.slotEl('dialog').parentNode, uiRoot);
    assert.equal(stage.slotEl('feed').parentNode, hud);
    // createHud's innerHTML='' detaches the feed slot — the next access seats it again.
    hud.removeChild(stage.slotEl('feed'));
    assert.equal(stage.slotEl('feed').parentNode, hud, 'the slot re-attached to the new hud');
    assert.deepEqual(stage.names().sort(), Object.keys(STAGE_SLOTS).sort());
    assert.ok(stagePriority('danger') > stagePriority('warning'));
    assert.ok(stagePriority('warning') > stagePriority('info'));
  } finally { restore(); }
});
