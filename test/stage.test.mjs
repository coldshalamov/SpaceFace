// G16-01 the Stage — the one host for every transient popup (design/program/fleet/drafts/
// G16-one-glass.md §4/§6). Headless fake-DOM proofs of the door contract: one visible item per
// slot (toasts: three), queued items order by severity then arrival, unknown slots throw, every
// shown item carries the kit frame, and reduced motion cuts instead of settling.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStage, STAGE_SLOTS, stagePriority } from '../src/ui/stage.js';
import { createAlerts } from '../src/ui/alerts.js';
import { createToasts } from '../src/ui/toasts.js';
import { createPromptDeck } from '../src/ui/promptDeck.js';
import { createScreenManager } from '../src/ui/screenManager.js';

// A tiny synchronous bus: emit() runs this event's listeners in subscription order, matching the
// fields the real emitters send (PROTOCOL — tests use the game's real payload shapes).
function createBus() {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {
        const list = handlers.get(name);
        const at = list.indexOf(fn);
        if (at >= 0) list.splice(at, 1);
      };
    },
    emit(name, payload) { for (const fn of handlers.get(name) || []) fn(payload); },
  };
}

function installDom() {
  class FakeClassList {
    constructor(owner) { this.owner = owner; this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); this._sync(); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); this._sync(); }
    toggle(v, force) {
      const on = force === undefined ? !this.values.has(v) : !!force;
      if (on) this.values.add(v); else this.values.delete(v);
      this._sync();
      return on;
    }
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
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get nextElementSibling() {
      if (!this.parentNode) return null;
      const at = this.parentNode.children.indexOf(this);
      return at >= 0 ? (this.parentNode.children[at + 1] || null) : null;
    }
    get childElementCount() { return this.children.length; }
    insertBefore(child, ref) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      const at = ref ? this.children.indexOf(ref) : -1;
      if (at < 0) this.children.push(child);
      else this.children.splice(at, 0, child);
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    replaceChildren(...nodes) {
      for (const c of [...this.children]) this.removeChild(c);
      nodes.forEach((n) => this.appendChild(n));
    }
    removeAttribute(k) { this.attributes.delete(k); }
    contains(node) {
      for (let n = node; n; n = n.parentNode) if (n === this) return true;
      return false;
    }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    dispatch(type, event = {}) {
      const ev = { type, target: this, preventDefault() {}, ...event };
      for (const fn of this.listeners.get(type) || []) fn(ev);
      return ev;
    }
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
  const docListeners = new Map();
  const doc = {
    documentElement,
    body,
    activeElement: null,
    defaultView: null,
    createElement: (tag) => new FakeElement(tag),
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener() {},
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
  const previous = {
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 1; // settle schedules; the classes land synchronously.
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc, uiRoot, hud,
    restore() {
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
      if (previous.raf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previous.raf;
      if (previous.caf === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previous.caf;
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
    const first = stage.show('dialog', 'first card');
    const info = stage.show('dialog', 'note', { severity: 'info' });
    const danger = stage.show('dialog', 'alarm', { severity: 'danger' });
    const warn = stage.show('dialog', 'caution', { severity: 'warning' });
    assert.deepEqual(stage.visible('dialog'), [danger.id],
      'a later danger takes the info seat by priority (G16-03)');
    assert.deepEqual(stage.queued('dialog'), [warn.id, first.id, info.id],
      'warning queues ahead of the two infos; equal priority keeps arrival order');
    stage.clear('dialog');
    assert.deepEqual(stage.visible('dialog'), [warn.id]);
    stage.clear('dialog');
    assert.deepEqual(stage.visible('dialog'), [first.id],
      'the demoted seat-holder returns ahead of its own priority class');
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

test('a refreshed id keeps its seat — a queued rival is not promoted past it', () => {
  const { doc, restore } = installDom();
  try {
    const stage = createStage({ document: doc });
    stage.show('banner', 'first', { id: 'a', severity: 'danger' });
    stage.show('banner', 'rival', { id: 'b', severity: 'warn' });
    assert.deepEqual(stage.queued('banner'), ['b']);
    const again = stage.show('banner', 'first, refreshed', { id: 'a', severity: 'danger' });
    assert.ok(again.visible, 'the refreshed item is still the one on the stage');
    assert.deepEqual(stage.visible('banner'), ['a']);
    assert.deepEqual(stage.queued('banner'), ['b']);
  } finally { restore(); }
});

test('banner and feed items join the host lane (#alerts, #toasts), never a second layer', () => {
  const { doc, uiRoot, hud, restore } = installDom();
  try {
    const alerts = doc.createElement('div'); alerts.id = 'alerts';
    const toasts = doc.createElement('div'); toasts.id = 'toasts';
    const stage = createStage({ document: doc });
    stage.slotEl('banner').appendChild(alerts);
    stage.slotEl('feed').appendChild(toasts);
    stage.show('banner', 'pill', { severity: 'danger' });
    stage.show('feed', 'receipt');
    assert.equal(flowOf(stage, 'banner'), undefined, 'no flow beside the alerts host');
    assert.ok(alerts.children.some((c) => c.classList.contains('sf-stage__flow')), 'the flow is a child of #alerts');
    assert.ok(toasts.children.some((c) => c.classList.contains('sf-stage__flow')), 'the flow is a child of #toasts');
    assert.equal(uiRoot.children.length > 0 && hud.children.length > 0, true);
  } finally { restore(); }
});

// ── G16-03 the Stage enforces (design/program/fleet/packets/G16-03-the-stage-enforces.md) ──────
// Real hosts, real payloads: the packet's proof is that the four native hosts now ride the
// slot queues instead of mounting beside them.

function alertsFixture() {
  const dom = installDom();
  const stage = createStage({ document: dom.doc });
  const alertsEl = dom.doc.createElement('div'); alertsEl.id = 'alerts';
  dom.uiRoot.appendChild(alertsEl);
  const bus = createBus();
  const host = createAlerts({
    bus, stage,
    state: { ui: {}, playerId: 'p1', simTime: 0, entities: new Map(), world: {} },
  });
  return { ...dom, stage, bus, host, alertsEl };
}

const bannerFlow = (alertsEl) => alertsEl.children.find(
  (c) => c.classList && c.classList.contains('sf-stage__flow'),
);

test('G16-03: two native alerts ride the banner FIFO — they never draw together', () => {
  const f = alertsFixture();
  try {
    // Real `alert` payloads — no ttl means a persistent status pill (alerts.js raise()).
    f.bus.emit('alert', { key: 'a', sev: 'info', text: 'FIRST' });
    f.bus.emit('alert', { key: 'b', sev: 'info', text: 'SECOND' });
    assert.deepEqual(f.stage.visible('banner'), ['alert:a'], 'one alert on stage');
    assert.deepEqual(f.stage.queued('banner'), ['alert:b'], 'the second waits, never overlaps');
    assert.equal(bannerFlow(f.alertsEl).children.length, 1, 'one pill mounted in #alerts');
    f.host.clear('a');
    assert.deepEqual(f.stage.visible('banner'), ['alert:b'], 'the queued alert promotes');
  } finally { f.restore(); }
});

test('G16-03: a danger alert replaces an info pill by priority; equals keep FIFO', () => {
  const f = alertsFixture();
  try {
    f.host.raise({ key: 'a', sev: 'info', text: 'A', ttl: Infinity });
    f.host.raise({ key: 'b', sev: 'info', text: 'B', ttl: Infinity });
    f.host.raise({ key: 'lock', sev: 'danger', text: 'MISSILE LOCK', ttl: Infinity });
    assert.deepEqual(f.stage.visible('banner'), ['alert:lock'], 'danger takes the seat');
    assert.deepEqual(f.stage.queued('banner'), ['alert:a', 'alert:b'], 'info pills wait in order');
    f.host.clear('lock');
    assert.deepEqual(f.stage.visible('banner'), ['alert:a'], 'the first info pill comes back');
    f.host.clear('a');
    assert.deepEqual(f.stage.visible('banner'), ['alert:b']);
  } finally { f.restore(); }
});

test('G16-03: the one-voice floor is a banner item — a danger voice preempts a pill', () => {
  const f = alertsFixture();
  try {
    f.host.raise({ key: 'dock', sev: 'dock', text: '[F] DOCK AT STATION', ttl: Infinity });
    // The real voice:surface payload voiceArbiter emits (id/channel/priority/text/kind/ttl).
    f.bus.emit('voice:surface', { id: 'alert:incoming', channel: 'alert', priority: 110, kind: 'danger', text: 'TAKING FIRE', ttl: 1.5 });
    assert.deepEqual(f.stage.visible('banner'), ['floor:alert:incoming'], 'the voice owns the strip');
    assert.deepEqual(f.stage.queued('banner'), ['alert:dock'], 'the dock prompt waits');
    f.bus.emit('voice:clear', { id: 'alert:incoming' });
    assert.deepEqual(f.stage.visible('banner'), ['alert:dock'], 'the pill returns when the voice clears');
  } finally { f.restore(); }
});
