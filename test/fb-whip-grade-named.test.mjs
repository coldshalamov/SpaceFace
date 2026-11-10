// The whip receipt already rates glance, solid, or crushing. The picture said
// "impact" and never the grade. Seed 4242 is the script, not a sim roll.

import test from 'node:test';
import assert from 'node:assert/strict';

import { calloutTextFor, createStuntCallout, impactGradeLine } from '../src/ui/stuntCallout.js';

const SEED = 4242;

function fakeDocument() {
  function createElement() {
    const el = {
      className: '', textContent: '', hidden: false, style: {}, children: [],
      classList: { add() {}, remove() {}, contains() { return false; } },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
        return child;
      },
      setAttribute() {},
      getAttribute() { return null; },
    };
    return el;
  }
  const head = { children: [], appendChild(c) { this.children.push(c); } };
  const body = { children: [], appendChild(c) { this.children.push(c); } };
  return {
    createElement,
    getElementById() { return null; },
    head,
    body,
    documentElement: { classList: { contains() { return false; } } },
  };
}

function fakeBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(cb);
      return () => {};
    },
    emit(event, payload) {
      for (const cb of handlers.get(event) || []) cb(payload);
    },
  };
}

test('a crushing whip on seed 4242 names the grade and the speed; an unrated hit stays quiet', () => {
  assert.equal(impactGradeLine('tether:whipImpact', { rating: 'missed', relSpeed: 100 }), null);
  assert.equal(impactGradeLine('tether:whipImpact', { rating: 'glance' }).name, 'GLANCE');
  assert.equal(impactGradeLine('massline:sweepImpact', { rating: 'solid', transverseSpeed: 60 }).name, 'SOLID SWEEP');
  const doc = fakeDocument();
  const bus = fakeBus();
  const state = {
    seed: SEED,
    mode: 'flight',
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: true } },
  };
  const callout = createStuntCallout({ state, bus, doc });
  bus.emit('tether:whipImpact', {
    rating: 'crushing', relSpeed: 96.4, victimId: 7, tick: SEED,
  });
  callout.update(0);
  const text = calloutTextFor(callout.root);
  assert.match(text, /CRUSHING/);
  assert.match(text, /96/);
  assert.doesNotMatch(text, /SWEEP/);
  bus.emit('massline:sweepImpact', {
    rating: 'glance', transverseSpeed: 31.2, victimId: 8, tick: SEED,
  });
  callout.update(0);
  const both = calloutTextFor(callout.root);
  assert.match(both, /GLANCE SWEEP/);
  assert.match(both, /31/);
  callout.destroy();
});
