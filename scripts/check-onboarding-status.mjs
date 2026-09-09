#!/usr/bin/env node
// check-onboarding-status.mjs — focused accessibility contract for the onboarding objective surface.
//
// Verifies:
//   1. The objective panel is a named semantic region without a competing live-status title.
//   2. Progress is exposed as text ("N / total") plus an aria-label ("step N of total").
//   3. Visual step dots are hidden from assistive tech.
//   4. The title element is stable across refreshes and only changes text on real updates.
//   5. Modal/dock UI hiding the panel via .ui-modal-open also sets aria-hidden=true, and
//      removing the class restores it.
//   6. Finishing the tutorial retires the panel so the HUD remains the sole story objective owner.
//   7. onboarding.js never calls focus().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(ROOT, 'src/systems/onboarding.js'), 'utf8');

let sections = 0;
function ok(label) {
  sections++;
  console.log('  PASS ' + label);
}

assert.doesNotMatch(src, /\.focus\s*\(/, 'onboarding.js must not steal focus with .focus()');
assert.match(src, /_syncModalAccessibility/, 'onboarding.js must sync modal accessibility state');
assert.match(src, /setAttribute\('role', 'region'\)/, 'panel must be a region');
assert.match(src, /setAttribute\('aria-label', 'Objective tracker'\)/, 'panel must name the tracker');
assert.doesNotMatch(src, /title\.setAttribute\('role', 'status'\)/, 'title must not compete as a live status region');
assert.doesNotMatch(src, /title\.setAttribute\('aria-live'/, 'title must not duplicate the tutorial voice for AT');
assert.match(src, /steps\.setAttribute\('aria-hidden', 'true'\)/, 'visual step dots must be hidden from AT');
ok('static a11y contract');

// ── Minimal DOM mock for the onboarding panel lifecycle ────────────────────────────────────────
class MockClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set((el.className || '').split(/\s+/).filter(Boolean));
  }
  _sync() { this._el.className = Array.from(this._set).join(' '); }
  add(c) { this._set.add(c); this._sync(); }
  remove(c) { this._set.delete(c); this._sync(); }
  contains(c) { return this._set.has(c); }
  toggle(c, force) {
    const want = force === undefined ? !this.contains(c) : !!force;
    if (want) this.add(c); else this.remove(c);
    return want;
  }
}

class MockElement {
  constructor(tag) {
    this.tagName = tag;
    this.id = '';
    this.className = '';
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this._textContent = '';
    this._innerHTML = '';
    this.parentNode = null;
  }
  get textContent() { return this._textContent; }
  set textContent(v) {
    this._textContent = String(v);
    this.children.length = 0;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children.length = 0;
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get classList() {
    if (!this._classList) this._classList = new MockClassList(this);
    return this._classList;
  }
}

function createMockDocument() {
  const head = new MockElement('head');
  const body = new MockElement('body');
  const uiRoot = new MockElement('div');
  uiRoot.id = 'ui-root';
  const byId = new Map([['ui-root', uiRoot]]);
  return {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => byId.get(id) || null,
    head,
    body,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

global.document = createMockDocument();
const { onboarding } = await import('../src/systems/onboarding.js');

function makeHarness() {
  const bus = createBus();
  const state = {
    meta: { seed: 47 },
    simTime: 0,
    settings: { gameplay: { tutorialHints: true } },
    player: { hints: {} },
    playerId: 'player',
    entities: new Map(),
    entityList: [],
    world: { activeSector: { stations: [], gates: [] } },
    nav: {},
    story: { beatIndex: 0 },
  };
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers: {}, registry: null });
  return { sys, state, bus };
}

const h = makeHarness();
h.bus.emit('game:started');
h.sys.update(0.2, h.state);

const panel = h.sys._panel;
assert.ok(panel, 'panel must exist after game:started + update');
assert.equal(panel.getAttribute('role'), 'region', 'panel must have role region');
assert.equal(panel.getAttribute('aria-label'), 'Objective tracker', 'panel must name the tracker');
assert.ok(!panel.hasAttribute('aria-hidden'), 'panel must not be aria-hidden while no modal is open');

const title = h.sys._titleEl;
assert.ok(title, 'title element must be cached');
assert.equal(title.getAttribute('role'), null, 'title must not be a competing status region');
assert.equal(title.getAttribute('aria-live'), null, 'title must not duplicate tutorial voice announcements');
assert.equal(title.textContent, 'Thrust until speed passes forty.', 'active beat text must render');

const count = h.sys._countEl;
assert.ok(count, 'count element must be cached');
assert.equal(count.textContent, '1 / 10', 'progress must be text "step / total"');
assert.equal(count.getAttribute('aria-label'), 'step 1 of 10', 'count must expose step semantics');

const steps = h.sys._stepsEl;
assert.ok(steps, 'steps element must be cached');
assert.equal(steps.getAttribute('aria-hidden'), 'true', 'visual dots must be hidden from AT');
assert.equal(steps.children.length, 10, 'one visual dot per tutorial beat must render');
ok('beat 0 panel a11y structure');

const titleBefore = h.sys._titleEl;
h.sys.update(0.2, h.state);
assert.equal(h.sys._titleEl, titleBefore, 'title element must be stable across updates');
assert.equal(h.sys._titleEl.textContent, 'Thrust until speed passes forty.', 'title text must not duplicate on unchanged beat');
ok('stable title element / no render-tick chatter');

// Beat change: simulate advancing to B1 and refreshing.
h.state.onboarding.currentBeat = 1;
h.sys._refreshBeatPanel();
assert.equal(h.sys._titleEl, titleBefore, 'title element must stay stable on beat change');
assert.equal(h.sys._titleEl.textContent, 'Brake below ten.', 'B1 title must update');
assert.equal(h.sys._countEl.textContent, '2 / 10', 'B1 count must update');
assert.equal(h.sys._countEl.getAttribute('aria-label'), 'step 2 of 10', 'B1 step label must update');
ok('beat change updates live status and progress text');

// Modal hide: CSS hides #sf-onboarding when body.ui-modal-open; mirror with aria-hidden.
document.body.classList.add('ui-modal-open');
h.sys._syncModalAccessibility();
assert.equal(panel.getAttribute('aria-hidden'), 'true', 'panel must be aria-hidden while modal UI is open');

document.body.classList.remove('ui-modal-open');
h.sys._syncModalAccessibility();
assert.equal(panel.hasAttribute('aria-hidden'), false, 'panel must be restored when modal UI closes');
ok('modal hide/restore semantic state');

// Story mode: the HUD mission tracker becomes the sole persistent objective owner.
h.sys._finish();
assert.equal(h.sys._storyMode, true, 'tutorial finish must enter story mode');
assert.equal(h.sys._panel, null, 'tutorial panel must retire when story mode begins');
assert.equal(h.sys._titleEl, null, 'retired tutorial title must not compete with HUD story guidance');
h.state.mode = 'flight';
h.state.story.beatIndex = 1;
h.sys.update(0.5, h.state);
assert.equal(h.sys._panel, null, 'story updates must not recreate a duplicate objective panel');
ok('story-mode yields to the HUD objective owner');

console.log('[check-onboarding-status] PASS — ' + sections + ' sections green');
