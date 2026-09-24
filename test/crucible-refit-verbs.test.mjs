// D30 — the refit footer's pad/keyboard verbs: a tap for Keep Going (Space / pad Y) and a
// 0.6 s hold-to-fire for the word that ends the run (F / pad X, filling ring). These pin the
// shared hold helper's fire-once/re-arm contract and the screen's routing of the hold to the
// word that is actually eligible — Take-the-win on the last wave, Extract on window waves,
// nothing while the armory draft is open.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// attachHoldVerb builds its ring through the kit's el(); a minimal document stub is enough —
// the helper only needs createElement, className, setAttribute, and style.setProperty.
globalThis.document ??= {
  createElement: (tag) => ({
    tag,
    className: '',
    textContent: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    appendChild(n) { (this.children ||= []).push(n); return n; },
  }),
};

const { attachHoldVerb } = await import('../src/ui/kit/holdVerb.js');
const { crucibleRefitScreen } = await import('../src/ui/screens/crucibleDraft.js');

function fakeButton() {
  const children = [];
  return {
    children,
    appendChild(n) { children.push(n); return n; },
    querySelector(sel) { return children.find((c) => c.className === sel.slice(1)) || null; },
  };
}

test('the hold fires once at the threshold and must be released to re-arm', () => {
  let fired = 0;
  const verb = attachHoldVerb(fakeButton(), { ms: 600, onFire: () => { fired += 1; } });
  verb.feed(true, 0.3);
  verb.feed(true, 0.59);
  assert.equal(fired, 0, 'below the threshold the verb stays quiet');
  verb.feed(true, 0.6);
  verb.feed(true, 0.7);
  verb.feed(true, 1.2);
  assert.equal(fired, 1, 'one hold fires exactly once, however long it is held');
  verb.feed(false);
  verb.feed(true, 0.6);
  assert.equal(fired, 2, 'a fresh hold after release fires again');
});

test('the ring paints progress while held and returns to rest on release', () => {
  const button = fakeButton();
  const verb = attachHoldVerb(button, { ms: 600 });
  verb.feed(true, 0.3);
  const ring = button.children.find((c) => c.className === 'dp-holdring');
  assert.ok(ring, 'the verb stamps its ring onto the word');
  assert.equal(ring.style.props['--sf-hold-p'], '0.5');
  verb.feed(true, 0.6);
  assert.equal(ring.style.props['--sf-hold-p'], '0', 'a fired ring drops, it does not sit full');
  verb.feed(true, 0.3);
  verb.feed(false);
  assert.equal(ring.style.props['--sf-hold-p'], '0');
});

function holdSpy() {
  const calls = [];
  return { calls, feed(held, heldForSec) { calls.push([held, heldForSec]); } };
}
const ctx = (run) => ({ state: { run } });

test('the hold routes to Take-the-win on the last wave, Extract on a window, nothing in the armory', () => {
  const done = holdSpy();
  const extract = holdSpy();
  const self = {
    _doneHold: done, _extractHold: extract,
    _ctx: ctx({ kind: 'survival', phase: 'refit', ruleset: 'scored', wave: 30, score: 100 }),
  };
  crucibleRefitScreen._feedEndHold.call(self, true, 0.4);
  assert.deepEqual(done.calls, [[true, 0.4]], 'last wave: the win word is the hold target');
  assert.deepEqual(extract.calls, [[false, 0.4]], 'last wave: extract is withdrawn and disarmed');

  self._ctx = ctx({ kind: 'survival', phase: 'refit', ruleset: 'swarm', wave: 10, score: 5 });
  done.calls.length = extract.calls.length = 0;
  crucibleRefitScreen._feedEndHold.call(self, true, 0.2);
  assert.deepEqual(done.calls, [[false, 0.2]], 'mid-run: the launch word never takes the hold');
  assert.deepEqual(extract.calls, [[true, 0.2]], 'mid-run window: Extract is the hold target');

  self._ctx = ctx({ kind: 'survival', phase: 'draft', ruleset: 'swarm', wave: 3 });
  done.calls.length = extract.calls.length = 0;
  crucibleRefitScreen._feedEndHold.call(self, true, 0.2);
  assert.deepEqual(done.calls, [[false, 0.2]]);
  assert.deepEqual(extract.calls, [[false, 0.2]], 'the armory draft has no run to end');
});

test('pad Y taps Keep Going only where the word is offered; pad X feeds the hold', () => {
  const done = holdSpy();
  const extract = holdSpy();
  let clicks = 0;
  const self = {
    _doneHold: done, _extractHold: extract,
    _continue: { click() { clicks += 1; } },
    _ctx: ctx({ kind: 'survival', phase: 'refit', ruleset: 'scored', wave: 30, score: 100 }),
    _feedEndHold(...a) { crucibleRefitScreen._feedEndHold.call(this, ...a); },
  };
  crucibleRefitScreen.onPadButton.call(self, 'y', { pressed: true, held: true, heldFor: 0 }, self._ctx);
  assert.equal(clicks, 1, 'Y taps the offered endless-continue');
  crucibleRefitScreen.onPadButton.call(self, 'x', { held: true, heldFor: 0.61 }, self._ctx);
  assert.deepEqual(done.calls.at(-1), [true, 0.61], 'X holds feed the end-run word with the held time');

  // A phase where Keep Going is not offered: Y does nothing rather than click a hidden word.
  self._ctx = ctx({ kind: 'survival', phase: 'refit', ruleset: 'swarm', wave: 10, score: 5 });
  crucibleRefitScreen.onPadButton.call(self, 'y', { pressed: true, held: true, heldFor: 0 }, self._ctx);
  assert.equal(clicks, 1);
});
