// FB-007 leftover: the stroke grader already names razor/clean/good/messy, and the ink
// already fades, but the pilot never heard the band. Seed 4242 is the script, not a roll.

import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyStrokeGrader, gradeStroke, gradeStrokeSample } from '../src/core/flight/drawFlightControl.js';
import { drawInkGrade, masslineHud, resolveDrawFlightInk } from '../src/ui/masslineHud.js';
import {
  announceStrokeGrade, calloutTextFor, ensureStuntCallout, releaseStuntCallout, strokeGradeLine,
} from '../src/ui/stuntCallout.js';

const SEED = 4242;

function fakeElement() {
  const el = {
    className: '', textContent: '', hidden: false, style: {}, children: [],
    attrs: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; },
    removeAttribute(name) { delete this.attrs[name]; },
  };
  return el;
}

function fakeDocument() {
  const head = fakeElement();
  const body = fakeElement();
  return {
    createElement: () => fakeElement(),
    getElementById() { return null; },
    head,
    body,
    documentElement: { classList: { contains() { return false; } } },
  };
}

function scriptedStroke(errorWu, speed) {
  const grader = emptyStrokeGrader();
  for (let i = 0; i < 12; i += 1) gradeStrokeSample(grader, errorWu, speed, 0.1);
  grader.distanceWu = 120;
  return gradeStroke(grader);
}

test('a razor stroke on seed 4242 is named with its peak speed; an unknown band stays quiet', () => {
  const speed = 80 + (SEED % 7);
  const razor = scriptedStroke(2, speed);
  assert.equal(razor.band, 'razor');
  const line = strokeGradeLine(razor);
  assert.equal(line.name, 'RAZOR STROKE');
  assert.equal(line.detail, String(Math.round(speed)));
  assert.equal(strokeGradeLine({ band: 'invented', peakSpeed: 40 }), null);
  assert.equal(strokeGradeLine(null), null);
  const messy = scriptedStroke(40, speed);
  assert.equal(messy.band, 'messy');
  assert.equal(strokeGradeLine(messy).name, 'MESSY STROKE');
  assert.equal(drawInkGrade('razor'), 'razor');
  assert.equal(drawInkGrade('nope'), '');
});

test('the ink wears the grade once, and the flight callout says it once', () => {
  releaseStuntCallout();
  const speed = 80 + (SEED % 7);
  const stroke = scriptedStroke(2, speed);
  const state = {
    seed: SEED,
    mode: 'flight',
    simTime: 10,
    run: null,
    ui: { screenStack: [], docked: false },
    playerId: 1,
    settings: { video: { motionReduce: true } },
    input: {
      autoTargetPath: {
        active: true,
        pointIndex: 2,
        points: [{ x: 0, z: 0 }, { x: 12, z: 0 }],
        stroke,
      },
    },
  };
  const callout = ensureStuntCallout({ state, doc: fakeDocument() });
  const svg = fakeElement();
  const path = fakeElement();
  masslineHud._updateDrawInk({
    inkSvg: svg, inkFlownPath: path, inkAheadPath: path,
  }, state, () => ({ x: 10, y: 20 }));
  const text = calloutTextFor(callout.root);
  assert.match(text, /RAZOR STROKE/);
  assert.match(text, new RegExp(String(Math.round(speed))));
  assert.equal(svg.getAttribute('data-grade'), 'razor');
  assert.equal(resolveDrawFlightInk(state).grade, 'razor');
  masslineHud._updateDrawInk({
    inkSvg: svg, inkFlownPath: path, inkAheadPath: path,
  }, state, () => ({ x: 10, y: 20 }));
  assert.equal((calloutTextFor(callout.root).match(/RAZOR STROKE/g) || []).length, 1);
  releaseStuntCallout();
  assert.equal(announceStrokeGrade(stroke), false);
});
