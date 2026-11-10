import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearTitleContinueLoadFailure,
  clearTitleContinueLoadFailureState,
  handleTitleContinueLoadFailure,
  mainMenuScreen,
  presentTitleContinueLoadFailure,
  reapplyTitleContinueLoadFailure,
} from '../src/ui/screens/mainMenu.js';
import { isTitleSaveReadFailure, saveErrorText, shouldToastSaveError } from '../src/ui/saveFeedback.js';

function liveTextTarget() {
  const attributes = new Map();
  return {
    attributes,
    textContent: 'Quick · saved today',
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

test('a failed title Continue uses the shared save copy in its single accessible alert line', () => {
  const target = liveTextTarget();
  const failure = {
    reason: 'load_failed',
    slot: 'achievements',
    error: 'Slot achievements is corrupt or not a SpaceFace save',
  };

  assert.equal(presentTitleContinueLoadFailure(target, failure), true);
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.textContent,
    'Load failed — Slot achievements is corrupt or not a SpaceFace save. Your save is untouched; try again, or export a backup from the Save screen.');
  assert.equal(target.attributes.get('role'), 'alert');
  assert.equal(target.attributes.get('aria-live'), 'assertive');
  assert.equal(target.attributes.get('aria-atomic'), 'true');

  clearTitleContinueLoadFailure(target);
  assert.equal(target.attributes.has('role'), false);
  assert.equal(target.attributes.has('aria-live'), false);
  assert.equal(target.attributes.has('aria-atomic'), false);
});

test('title recovery presents real prepare failures such as the achievements metadata record', () => {
  const target = liveTextTarget();
  const failure = { reason: 'bad_format', slot: 'achievements' };

  assert.equal(isTitleSaveReadFailure(failure), true);
  assert.equal(presentTitleContinueLoadFailure(target, failure), true);
  assert.equal(target.textContent, 'Slot achievements is corrupt or not a SpaceFace save');
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.attributes.get('role'), 'alert');
  assert.equal(target.attributes.get('aria-live'), 'assertive');
});

test('only title-visible read failures replace the global toast with the title alert', () => {
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'bad_format' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'restore_prepare_failed' }, true), false);
  assert.equal(shouldToastSaveError({ reason: 'load_failed' }, false), true);
  assert.equal(shouldToastSaveError({ reason: 'quota' }, true), true,
    'other save receipts keep the existing global presenter');
  assert.equal(isTitleSaveReadFailure({ reason: 'bad_format', trigger: 'manual' }), false,
    'write receipts remain on the global receipt path');
  assert.equal(shouldToastSaveError({ reason: 'bad_format', trigger: 'manual' }, true), true);
  assert.equal(saveErrorText({ reason: 'no_player', slot: 'quick' }), 'Quick has no playable ship');
  assert.equal(saveErrorText({ reason: 'no_player', slot: 'quick', trigger: 'manual' }),
    'Start or load a game before saving');
  assert.equal(isTitleSaveReadFailure({ reason: 'superseded', slot: 'quick' }), false);
  assert.equal(isTitleSaveReadFailure({ reason: 'read_failed', slot: 'import' }), false,
    'a file-import read error cannot replace the title summary');
  assert.equal(shouldToastSaveError({ reason: 'superseded' }, false), false,
    'intentional route replacement remains quiet');

  const target = liveTextTarget();
  assert.equal(presentTitleContinueLoadFailure(target, { reason: 'quota' }), false);
  assert.equal(target.textContent, 'Quick · saved today');
  assert.equal(target.attributes.size, 0);
});

test('the title presenter ignores a load failure while another screen is on top', () => {
  const target = liveTextTarget();
  const refs = { saveSummary: target };
  const failure = { reason: 'load_failed', slot: 'quick', error: 'damaged save' };

  assert.equal(handleTitleContinueLoadFailure({ screenManager: { top: () => 'saveLoad' } }, refs, failure), false);
  assert.equal(target.textContent, 'Quick · saved today');
  assert.equal(target.attributes.size, 0);
  assert.equal(handleTitleContinueLoadFailure({ screenManager: { top: () => 'mainMenu' } }, refs, failure), true);
  assert.equal(target.textContent, saveErrorText(failure));
  assert.equal(target.attributes.get('role'), 'alert');
});

test('title Continue failure uses the visible ORRERY status line when the rail note is clipped', () => {
  const summary = liveTextTarget();
  const status = liveTextTarget();
  const failure = { reason: 'load_failed', slot: 'quick', error: 'damaged save' };

  assert.equal(handleTitleContinueLoadFailure(
    { screenManager: { top: () => 'mainMenu' } },
    { saveSummary: summary, status },
    failure,
  ), true);
  assert.equal(summary.textContent, 'Quick · saved today', 'the clipped note remains the save metadata');
  assert.equal(status.textContent, saveErrorText(failure));
  assert.equal(status.attributes.get('role'), 'alert');
  assert.equal(status.attributes.get('aria-live'), 'assertive');

  clearTitleContinueLoadFailure(status);
  assert.equal(status.attributes.size, 0, 'the next render can reclaim the status line');
});

test('routine title renders retain a classified Continue failure until retry or successful load', () => {
  const summary = liveTextTarget();
  const status = liveTextTarget();
  const refs = { saveSummary: summary, status, titleContinueFailure: null };
  const failure = { reason: 'load_failed', slot: 'quick', error: 'damaged save' };

  assert.equal(handleTitleContinueLoadFailure(
    { screenManager: { top: () => 'mainMenu' } },
    refs,
    failure,
  ), true);
  assert.deepEqual(refs.titleContinueFailure, failure);

  // This is the tail of the real save:completed/save:slotsValidated render path: ordinary title
  // copy and accessibility state are rewritten, then the title-owned failure is reapplied.
  clearTitleContinueLoadFailure(summary);
  clearTitleContinueLoadFailure(status);
  summary.textContent = 'Quick · saved again';
  status.textContent = 'Continue · Quick · saved again';
  assert.equal(reapplyTitleContinueLoadFailure(refs), true);
  assert.equal(status.textContent, saveErrorText(failure));
  assert.equal(status.attributes.get('role'), 'alert');
  assert.equal(status.attributes.get('aria-live'), 'assertive');

  // A retry or a successful save:loaded event owns the explicit clear; routine write events do not.
  clearTitleContinueLoadFailureState(refs);
  assert.equal(refs.titleContinueFailure, null);
  assert.equal(status.attributes.size, 0);
  status.textContent = 'Continue · Quick · saved again';
  assert.equal(reapplyTitleContinueLoadFailure(refs), false);
  assert.equal(status.textContent, 'Continue · Quick · saved again');
});

// ── The Continue veil must lift with the failure alert (F-START-02) ────────────────
// _showContinueFade covers the title in opaque black (z 1900) while the load runs. A load
// rejected before any mode edge (corrupt slot, preflight/read failure — state.mode stays
// 'menu', so mode:changed never fires) used to hold the veil for the full 4s failsafe,
// hiding the alert the same save:error produced. The veil now lifts on a classified
// read/load failure; unclassified save receipts keep it up for a load still in flight.

function installFadeDom() {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...vs) { vs.forEach((v) => this.values.add(v)); }
    remove(...vs) { vs.forEach((v) => this.values.delete(v)); }
    contains(v) { return this.values.has(v); }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.classList = new FakeClassList();
      this.textContent = '';
      this.id = '';
      this.offsetWidth = 0;
      this._className = '';
    }
    get className() { return this._className; }
    set className(v) {
      this._className = String(v || '');
      this.classList.values = new Set(this._className.split(/\s+/).filter(Boolean));
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    querySelector(sel) {
      const cls = sel.startsWith('.') ? sel.slice(1) : sel;
      const walk = (node) => {
        for (const child of node.children) {
          if (child.classList && child.classList.contains(cls)) return child;
          const deep = walk(child);
          if (deep) return deep;
        }
        return null;
      };
      return walk(this);
    }
  }
  const body = new FakeElement('body');
  const doc = {
    body,
    createElement(tag) { return new FakeElement(tag); },
    getElementById() { return null; },
    querySelector(sel) { return body.querySelector(sel); },
    addEventListener() {},
    removeEventListener() {},
    activeElement: null,
  };
  return { body, doc };
}

function makeFadeBus() {
  const handlers = new Map();
  return {
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, []);
      handlers.get(ev).push(fn);
      return () => {
        const list = handlers.get(ev) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    emit(ev, payload) {
      for (const fn of (handlers.get(ev) || [])) fn(payload);
    },
  };
}

test('a classified save:error lifts the Continue veil immediately, without a mode edge', () => {
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const { doc } = installFadeDom();
  globalThis.document = doc;
  // rAF never fires in the fixture: the veil's 200ms timer channel stays the only poller,
  // so any synchronous lift proves the event path rather than the frame/failsafe path.
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const bus = makeFadeBus();
    const ctx = { state: { mode: 'menu' }, bus };
    mainMenuScreen._showContinueFade(ctx, 'Ceres Belt');
    const fade = doc.querySelector('.sf-continue-fade');
    assert.ok(fade, 'the veil mounted');
    assert.equal(fade.classList.contains('open'), true, 'the veil is opaque over the title');

    // The load is rejected while mode is still 'menu' — no mode:changed edge exists.
    bus.emit('save:error', { reason: 'load_failed', slot: 'quick', error: 'damaged save' });
    assert.equal(fade.classList.contains('open'), false,
      'a classified load failure lifts the veil with the alert, not after 4s');
    assert.equal(fade._sfContinueFadeLoop.stale, true, 'the veil loop is retired');
  } finally {
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  }
});

test('unclassified save receipts keep the Continue veil up while a load may still land', () => {
  const previousDocument = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const { doc } = installFadeDom();
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const bus = makeFadeBus();
    const ctx = { state: { mode: 'menu' }, bus };
    mainMenuScreen._showContinueFade(ctx, 'Ceres Belt');
    const fade = doc.querySelector('.sf-continue-fade');
    assert.equal(fade.classList.contains('open'), true);

    // Write-path noise and trigger-scoped receipts are not Continue failures.
    bus.emit('save:error', { reason: 'quota', slot: 'quick' });
    assert.equal(fade.classList.contains('open'), true, 'quota noise keeps the veil');
    bus.emit('save:error', { reason: 'read_failed', slot: 'quick', trigger: 'autosave' });
    assert.equal(fade.classList.contains('open'), true, 'triggered receipts keep the veil');
    bus.emit('save:error', { reason: 'read_failed', slot: 'import' });
    assert.equal(fade.classList.contains('open'), true, 'import read errors keep the veil');

    // The real failure still lands the lift — and the mode-edge path still works too.
    bus.emit('save:error', { reason: 'read_failed', slot: 'quick' });
    assert.equal(fade.classList.contains('open'), false, 'the classified failure lifts it');

    mainMenuScreen._showContinueFade(ctx, 'Ceres Belt');
    assert.equal(fade.classList.contains('open'), true, 'a retry re-arms the veil');
    bus.emit('mode:changed', { mode: 'menu' });
    assert.equal(fade.classList.contains('open'), false, 'a bounced mode edge still lifts it');
  } finally {
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancelRaf;
  }
});
